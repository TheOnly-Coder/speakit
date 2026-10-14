import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { joinServerSchema } from "@/lib/validations";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = joinServerSchema.safeParse({ inviteCode: String(body?.inviteCode ?? "").trim().toUpperCase() });
  if (!parsed.success) return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });

  const server = await prisma.server.findUnique({ where: { inviteCode: parsed.data.inviteCode } });
  if (!server) return NextResponse.json({ error: "Server not found. Check the invite code." }, { status: 404 });

  const banned = await prisma.ban.findUnique({
    where: { serverId_userId: { serverId: server.id, userId } },
  });
  if (banned) return NextResponse.json({ error: "You are banned from this server." }, { status: 403 });

  const existing = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: server.id } },
  });
  if (!existing) {
    await prisma.serverMember.create({ data: { userId, serverId: server.id, role: "member" } });
  }
  const full = await prisma.server.findUnique({
    where: { id: server.id },
    include: { channels: { orderBy: { position: "asc" } } },
  });
  return NextResponse.json({ server: full });
}
