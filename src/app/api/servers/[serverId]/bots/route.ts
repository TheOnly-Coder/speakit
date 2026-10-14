import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ensureBotMembership } from "@/lib/bots/executor";
import { parseCommands } from "@/lib/bots/templates";

/**
 * Bots installed in this server (any member can read — powers the "/"
 * autocomplete menu). Includes each bot's exposed commands.
 */
export async function GET(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: params.serverId } },
  });
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const installs = await prisma.botServer.findMany({
    where: { serverId: params.serverId },
    include: { bot: { include: { botUser: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    bots: installs.map((i) => ({
      id: i.bot.id,
      userId: i.bot.userId,
      name: i.bot.botUser.displayName,
      username: i.bot.botUser.username,
      avatarColor: i.bot.botUser.avatarColor,
      avatarUrl: i.bot.botUser.avatarUrl,
      enabled: i.bot.enabled,
      commands: parseCommands(i.bot.commands),
      addedById: i.addedById,
      installedAt: i.createdAt,
    })),
  });
}

const installSchema = z.object({ code: z.string().min(4).max(32) });

/**
 * Install a bot with its share code. Requires Manage Server — paste the code
 * the bot owner gave you and the bot joins as a regular member instantly.
 */
export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageServer"))) {
    return NextResponse.json({ error: "Missing permission: Manage server" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = installSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter the bot's share code" }, { status: 400 });
  const code = parsed.data.code.trim().toUpperCase();

  const bot = await prisma.bot.findUnique({
    where: { shareCode: code },
    include: { botUser: true },
  });
  if (!bot) return NextResponse.json({ error: "No bot uses that code — check it and try again" }, { status: 404 });

  const existing = await prisma.botServer.findUnique({
    where: { botId_serverId: { botId: bot.id, serverId: params.serverId } },
  });
  if (existing) return NextResponse.json({ error: `"${bot.botUser.displayName}" is already in this server` }, { status: 409 });

  await ensureBotMembership(bot.userId, params.serverId);
  await prisma.botServer.create({
    data: { botId: bot.id, serverId: params.serverId, addedById: userId },
  });
  return NextResponse.json({
    ok: true,
    bot: { id: bot.id, name: bot.botUser.displayName, commands: parseCommands(bot.commands) },
  }, { status: 201 });
}
