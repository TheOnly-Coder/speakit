import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { createServerSchema } from "@/lib/validations";
import { generateInviteCode } from "@/lib/invite";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await prisma.serverMember.findMany({
    where: { userId },
    include: { server: { include: { _count: { select: { members: true } } } } },
    orderBy: { joinedAt: "asc" },
  });
  const servers = memberships.map((m) => ({
    id: m.server.id,
    name: m.server.name,
    iconColor: m.server.iconColor,
    iconUrl: m.server.iconUrl,
    inviteCode: m.server.inviteCode,
    ownerId: m.server.ownerId,
    memberCount: m.server._count.members,
    role: m.role,
  }));
  return NextResponse.json({ servers });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = createServerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Server name is required" }, { status: 400 });

  const inviteCode = generateInviteCode();
  const server = await prisma.server.create({
    data: {
      name: parsed.data.name.trim().slice(0, 64),
      inviteCode,
      ownerId: userId,
      iconColor: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`,
      members: { create: { userId, role: "owner" } },
      channels: {
        create: [
          { name: "general", type: "TEXT", topic: "Welcome to #general 👋", position: 0 },
          { name: "random", type: "TEXT", topic: "Off-topic chat", position: 1 },
          { name: "Lounge", type: "VOICE", position: 2 },
        ],
      },
    },
    include: { channels: true },
  });

  return NextResponse.json({ server });
}
