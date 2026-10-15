import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getBotByToken } from "@/lib/bots/executor";
import { broadcastChannelMessage } from "@/lib/bots/emit";
import { canInChannel } from "@/lib/channelPerms";

function tokenFrom(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bot ")) return auth.slice(4).trim();
  return (req.headers.get("x-bot-token") ?? "").trim();
}

const sendSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1).max(500),
  replyToId: z.string().optional(),
});

/**
 * External Bot HTTP API — send a message as your bot from any script.
 *
 *   curl -X POST $BASE/api/bot-api/send \
 *     -H "Authorization: Bot spk_..." \
 *     -H "Content-Type: application/json" \
 *     -d '{"channelId":"...","content":"Hello from my script!"}'
 */
export async function POST(req: Request) {
  const bot = await getBotByToken(tokenFrom(req));
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  if (!bot.enabled) return NextResponse.json({ error: "Bot is disabled" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "channelId + content (max 500 chars) required" }, { status: 400 });
  const content = parsed.data.content.trim();
  if (!content) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });

  const channel = await prisma.channel.findUnique({ where: { id: parsed.data.channelId } });
  if (!channel || channel.type !== "TEXT") {
    return NextResponse.json({ error: "Channel not found or not a text channel" }, { status: 404 });
  }
  const installed = bot.servers.some((s) => s.serverId === channel.serverId);
  if (!installed) return NextResponse.json({ error: "Bot is not in that channel's server" }, { status: 403 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: bot.userId, serverId: channel.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Bot is not a member there (re-add it)" }, { status: 403 });
  if (!(await canInChannel(bot.userId, channel, "view"))) {
    return NextResponse.json({ error: "Bot cannot view that channel" }, { status: 403 });
  }
  if (!(await canInChannel(bot.userId, channel, "send"))) {
    return NextResponse.json({ error: "Bot cannot send in that channel" }, { status: 403 });
  }

  // Gentle anti-spam: 5 messages / 10s per bot per channel.
  const recent = await prisma.message.count({
    where: { channelId: channel.id, authorId: bot.userId, createdAt: { gte: new Date(Date.now() - 10_000) } },
  });
  if (recent >= 5) return NextResponse.json({ error: "Rate limited: slow down (5/10s)" }, { status: 429 });

  let replyToId: string | undefined;
  if (parsed.data.replyToId) {
    const target = await prisma.message.findUnique({ where: { id: parsed.data.replyToId } });
    if (!target || target.channelId !== channel.id) {
      return NextResponse.json({ error: "replyToId not found in that channel" }, { status: 400 });
    }
    replyToId = target.id;
  }

  const created = await prisma.message.create({
    data: { content, channelId: channel.id, authorId: bot.userId, replyToId },
    include: { author: true },
  });

  const payload = {
    id: created.id,
    content: created.content,
    channelId: created.channelId,
    edited: created.edited,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    author: {
      id: created.author.id,
      username: created.author.username,
      displayName: created.author.displayName,
      avatarColor: created.author.avatarColor,
      avatarUrl: created.author.avatarUrl,
      isBot: true,
    },
    replyTo: null,
    reactions: [],
    attachments: [],
  };
  broadcastChannelMessage(channel.id, payload);
  return NextResponse.json({ message: payload }, { status: 201 });
}
