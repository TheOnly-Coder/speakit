import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: params.serverId } },
  });
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    include: {
      channels: { orderBy: { position: "asc" } },
      members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    server: {
      id: server.id,
      name: server.name,
      iconColor: server.iconColor,
      inviteCode: server.inviteCode,
      ownerId: server.ownerId,
      channels: server.channels,
      members: server.members.map((m) => ({
        id: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        avatarColor: m.user.avatarColor,
        avatarUrl: m.user.avatarUrl,
        status: m.user.status,
        role: m.role,
      })),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const server = await prisma.server.findUnique({ where: { id: params.serverId } });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (server.ownerId === userId) {
    await prisma.server.delete({ where: { id: server.id } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  await prisma.serverMember.deleteMany({ where: { userId, serverId: server.id } });
  return NextResponse.json({ ok: true, left: true });
}
