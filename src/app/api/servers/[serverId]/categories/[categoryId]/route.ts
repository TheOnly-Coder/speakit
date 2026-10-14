import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: { serverId: string; categoryId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageChannels"))) {
    return NextResponse.json({ error: "Missing permission: Manage channels" }, { status: 403 });
  }
  const cat = await prisma.serverCategory.findUnique({ where: { id: params.categoryId } });
  if (!cat || cat.serverId !== params.serverId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.channel.updateMany({ where: { categoryId: cat.id }, data: { categoryId: null } });
  await prisma.serverCategory.delete({ where: { id: cat.id } });
  return NextResponse.json({ ok: true });
}
