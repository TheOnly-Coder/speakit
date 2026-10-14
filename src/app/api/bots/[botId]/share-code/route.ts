import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { requireOwnedBot, newBotShareCode } from "@/lib/bots/executor";

/**
 * Regenerate the bot's public share code. The old code stops working
 * immediately — use this if a code leaks somewhere it shouldn't be.
 */
export async function POST(_req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  for (let i = 0; i < 10; i++) {
    const shareCode = newBotShareCode();
    try {
      await prisma.bot.update({ where: { id: bot.id }, data: { shareCode } });
      return NextResponse.json({ shareCode });
    } catch {
      /* collision — try again */
    }
  }
  return NextResponse.json({ error: "Couldn't generate a code, try again" }, { status: 500 });
}
