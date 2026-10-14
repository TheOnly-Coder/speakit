import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { requireOwnedBot, botMentionsMe } from "@/lib/bots/executor";
import { runBotCode, parseStore } from "@/lib/bots/sandbox";

const testSchema = z.object({
  content: z.string().min(1).max(500),
  channelId: z.string().optional(),
});

/**
 * Dry-run the bot's code against a fake message. Writes NOTHING —
 * returns the logs + the messages the bot WOULD have sent.
 */
export async function POST(req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Type a test message first" }, { status: 400 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  let channel = { id: "test", name: "test-channel", serverId: "test", serverName: "Test server" };
  if (parsed.data.channelId) {
    const ch = await prisma.channel.findUnique({
      where: { id: parsed.data.channelId },
      include: { server: { select: { id: true, name: true } } },
    });
    if (!ch) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    const install = await prisma.botServer.findUnique({
      where: { botId_serverId: { botId: bot.id, serverId: ch.server.id } },
    });
    if (!install) return NextResponse.json({ error: "Add the bot to that server first" }, { status: 400 });
    channel = { id: ch.id, name: ch.name, serverId: ch.server.id, serverName: ch.server.name };
  } else if (bot.servers.length > 0) {
    const first = bot.servers[0].server;
    const ch = await prisma.channel.findFirst({
      where: { serverId: first.id, type: "TEXT" },
      orderBy: { position: "asc" },
    });
    if (ch) channel = { id: ch.id, name: ch.name, serverId: first.id, serverName: first.name };
  }

  const content = parsed.data.content;
  const result = await runBotCode({
    code: bot.code,
    store: parseStore(bot.store),
    msg: {
      id: "test",
      content,
      author: {
        id: userId,
        username: me?.username ?? "you",
        displayName: me?.displayName ?? "You",
        isBot: false,
      },
      channel: { id: channel.id, name: channel.name, serverId: channel.serverId },
      server: { id: channel.serverId, name: channel.serverName },
      mentionsMe: botMentionsMe(content, bot.botUser.username, bot.botUser.displayName),
      bot: { id: bot.id, userId: bot.userId, name: bot.botUser.displayName },
    },
  });

  return NextResponse.json({
    logs: result.logs,
    actions: result.actions,
    error: result.error,
    note: parsed.data.channelId
      ? undefined
      : "Dry run — no channel picked, so api.send targets the test channel.",
  });
}
