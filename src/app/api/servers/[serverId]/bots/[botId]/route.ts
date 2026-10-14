import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

/** Remove a bot from this server (Manage Server). The bot's owner can re-add it. */
export async function DELETE(_req: Request, { params }: { params: { serverId: string; botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageServer"))) {
    return NextResponse.json({ error: "Missing permission: Manage server" }, { status: 403 });
  }

  const bot = await prisma.bot.findUnique({ where: { id: params.botId } });
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  await prisma.botServer.deleteMany({ where: { botId: bot.id, serverId: params.serverId } });
  await prisma.serverMember.deleteMany({ where: { userId: bot.userId, serverId: params.serverId } });
  return NextResponse.json({ ok: true });
}
