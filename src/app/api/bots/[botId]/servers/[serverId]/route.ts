import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { requireOwnedBot } from "@/lib/bots/executor";

/** Remove the bot from a server (also removes its membership row there). */
export async function DELETE(_req: Request, { params }: { params: { botId: string; serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  await prisma.botServer.deleteMany({ where: { botId: bot.id, serverId: params.serverId } });
  await prisma.serverMember.deleteMany({ where: { userId: bot.userId, serverId: params.serverId } });
  return NextResponse.json({ ok: true });
}
