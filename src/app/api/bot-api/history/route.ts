import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBotByToken } from "@/lib/bots/executor";

function tokenFrom(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bot ")) return auth.slice(4).trim();
  return (req.headers.get("x-bot-token") ?? "").trim();
}

/** Read recent history (token auth): GET ?channelId=...&limit=20 */
export async function GET(req: Request) {
  const bot = await getBotByToken(tokenFrom(req));
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId") ?? "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 50);
  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const installed = bot.servers.some((s) => s.serverId === channel.serverId);
  if (!installed) return NextResponse.json({ error: "Bot is not in that channel's server" }, { status: 403 });

  const messages = await prisma.message.findMany({
    where: { channelId },
    include: { author: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({
    messages: messages.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      channelId: m.channelId,
      createdAt: m.createdAt,
      author: {
        id: m.author.id,
        username: m.author.username,
        displayName: m.author.displayName,
        isBot: !!m.author.isBot,
      },
    })),
  });
}
