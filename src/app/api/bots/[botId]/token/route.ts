import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { requireOwnedBot, newBotToken } from "@/lib/bots/executor";

/** Regenerate the secret token. The old token stops working immediately. */
export async function POST(_req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  const token = newBotToken();
  await prisma.bot.update({ where: { id: bot.id }, data: { token } });
  // Returned ONCE — the list/detail endpoints only ever expose a hint.
  return NextResponse.json({ token });
}
