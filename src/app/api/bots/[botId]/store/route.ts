import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { requireOwnedBot } from "@/lib/bots/executor";

/** Reset the bot's persistent memory (store). */
export async function DELETE(_req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  await prisma.bot.update({ where: { id: bot.id }, data: { store: "{}" } });
  return NextResponse.json({ ok: true });
}
