import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: { serverId: string; emojiId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageEmoji"))) {
    return NextResponse.json({ error: "Missing permission: Manage emoji" }, { status: 403 });
  }
  const emoji = await prisma.customEmoji.findUnique({ where: { id: params.emojiId } });
  if (!emoji || emoji.serverId !== params.serverId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.customEmoji.delete({ where: { id: emoji.id } });
  return NextResponse.json({ ok: true });
}
