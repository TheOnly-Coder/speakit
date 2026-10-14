import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBotByToken } from "@/lib/bots/executor";

function tokenFrom(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bot ")) return auth.slice(4).trim();
  return (req.headers.get("x-bot-token") ?? "").trim();
}

/** Who am I + where am I installed (token auth). */
export async function GET(req: Request) {
  const bot = await getBotByToken(tokenFrom(req));
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const servers = await prisma.botServer.findMany({
    where: { botId: bot.id },
    include: { server: { select: { id: true, name: true } } },
  });
  return NextResponse.json({
    bot: {
      id: bot.id,
      userId: bot.userId,
      name: bot.botUser.displayName,
      username: bot.botUser.username,
      avatarColor: bot.botUser.avatarColor,
      avatarUrl: bot.botUser.avatarUrl,
      enabled: bot.enabled,
    },
    servers: servers.map((s) => s.server),
  });
}
