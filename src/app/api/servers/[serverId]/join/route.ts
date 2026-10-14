import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

/** Join a public (discoverable) server directly by id. Private servers need an invite code. */
export async function POST(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const server = await prisma.server.findUnique({ where: { id: params.serverId } });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!server.discoverable) {
    return NextResponse.json({ error: "This server is private — ask for an invite code" }, { status: 403 });
  }
  const banned = await prisma.ban.findUnique({ where: { serverId_userId: { serverId: server.id, userId } } });
  if (banned) return NextResponse.json({ error: "You are banned from this server." }, { status: 403 });
  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId, serverId: server.id } },
    create: { userId, serverId: server.id, role: "member" },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
