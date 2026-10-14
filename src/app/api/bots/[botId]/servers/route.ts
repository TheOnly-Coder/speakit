import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { requireOwnedBot, ensureBotMembership } from "@/lib/bots/executor";

export async function GET(_req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  // Servers the owner can add this bot to (must be a member, bot not banned).
  const memberships = await prisma.serverMember.findMany({
    where: { userId },
    include: { server: { select: { id: true, name: true, iconColor: true, iconUrl: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const installedIds = new Set(bot.servers.map((s) => s.server.id));
  return NextResponse.json({
    installed: bot.servers.map((s) => s.server),
    available: memberships.map((m) => ({ ...m.server, installed: installedIds.has(m.server.id) })),
  });
}

export async function POST(req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const serverId = String(body?.serverId ?? "");
  if (!serverId) return NextResponse.json({ error: "Pick a server" }, { status: 400 });

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  // Only a member can invite their bot (Discord parity: Manage Server would be
  // stricter; membership keeps community bots easy while staying safe).
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
  });
  if (!membership) return NextResponse.json({ error: "Join that server first" }, { status: 403 });

  await ensureBotMembership(bot.userId, serverId);
  await prisma.botServer.upsert({
    where: { botId_serverId: { botId: bot.id, serverId } },
    create: { botId: bot.id, serverId, addedById: userId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
