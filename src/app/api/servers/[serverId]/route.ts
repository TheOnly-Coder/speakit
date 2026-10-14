import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { visibleChannels } from "@/lib/channelPerms";
import { visibleStatus } from "@/lib/presence";
import { z } from "zod";

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
      categories: { orderBy: { position: "asc" } },
      roles: { orderBy: { position: "asc" }, include: { _count: { select: { memberRoles: true } } } },
      bans: { include: {}, orderBy: { createdAt: "desc" } },
      customEmojis: { orderBy: { name: "asc" } },
      members: { include: { user: true, memberRoles: { include: { role: true } } }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const banUserIds = server.bans.map((b) => b.userId);
  const banUsers = banUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: banUserIds } } })
    : [];
  const banName = new Map(banUsers.map((u) => [u.id, { username: u.username, displayName: u.displayName }]));

  return NextResponse.json({
    server: {
      id: server.id,
      name: server.name,
      iconColor: server.iconColor,
      iconUrl: server.iconUrl,
      bannerUrl: (server as unknown as { bannerUrl?: string }).bannerUrl ?? "",
      description: (server as unknown as { description?: string }).description ?? "",
      tags: (server as unknown as { tags?: string }).tags ?? "",
      inviteCode: server.inviteCode,
      discoverable: server.discoverable,
      allowExternalEmoji: server.allowExternalEmoji,
      ownerId: server.ownerId,
      channels: await visibleChannels(userId, server.id, server.channels),
      categories: server.categories,
      roles: server.roles.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: safeParsePerms(r.permissions),
        memberCount: r._count.memberRoles,
      })),
      bans: server.bans.map((b) => ({
        id: b.id,
        userId: b.userId,
        reason: b.reason,
        username: banName.get(b.userId)?.username ?? "?",
        displayName: banName.get(b.userId)?.displayName ?? "Unknown user",
      })),
      customEmojis: server.customEmojis,
      members: server.members.map((m) => ({
        id: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        avatarColor: m.user.avatarColor,
        avatarUrl: m.user.avatarUrl,
        status: visibleStatus(m.user.status, m.user.id),
        isBot: !!(m.user as { isBot?: boolean }).isBot,
        role: m.role,
        roleIds: m.memberRoles.map((mr) => mr.roleId),
        roleNames: m.memberRoles.map((mr) => mr.role.name),
      })),
    },
  });
}

function safeParsePerms(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  iconUrl: z.string().max(2048).optional(),
  bannerUrl: z.string().max(2048).optional(),
  description: z.string().max(256).optional(),
  tags: z.string().max(256).optional(),
  discoverable: z.boolean().optional(),
  allowExternalEmoji: z.boolean().optional(),
  inviteCode: z.string().min(4).max(8).regex(/^[A-Z0-9]+$/).optional(),
});

export async function PATCH(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageServer"))) {
    return NextResponse.json({ error: "Missing permission: Manage server" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim().slice(0, 64);
  if (parsed.data.iconUrl !== undefined) {
    const url = parsed.data.iconUrl.trim();
    if (url !== "" && !isServerImageUrl(url)) return NextResponse.json({ error: "Invalid icon image" }, { status: 400 });
    data.iconUrl = url.slice(0, 2048);
  }
  if (parsed.data.bannerUrl !== undefined) {
    const url = parsed.data.bannerUrl.trim();
    if (url !== "" && !isServerImageUrl(url)) return NextResponse.json({ error: "Invalid banner image" }, { status: 400 });
    data.bannerUrl = url.slice(0, 2048);
  }
  if (parsed.data.description !== undefined) data.description = parsed.data.description.trim().slice(0, 256);
  if (parsed.data.tags !== undefined) {
    data.tags = parsed.data.tags
      .split(",")
      .map((t) => t.trim().replace(/^#+/, "").slice(0, 24))
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
  }
  if (parsed.data.discoverable !== undefined) data.discoverable = parsed.data.discoverable;
  if (parsed.data.allowExternalEmoji !== undefined) data.allowExternalEmoji = parsed.data.allowExternalEmoji;
  if (parsed.data.inviteCode !== undefined) {
    const code = parsed.data.inviteCode.toUpperCase();
    const memberCount = await prisma.serverMember.count({ where: { serverId: params.serverId } });
    if (memberCount < 10) {
      return NextResponse.json({ error: `Custom invite codes unlock at 10 members (this server has ${memberCount})` }, { status: 400 });
    }
    const taken = await prisma.server.findUnique({ where: { inviteCode: code } });
    if (taken && taken.id !== params.serverId) return NextResponse.json({ error: "That code is taken" }, { status: 409 });
    data.inviteCode = code;
  }

  const server = await prisma.server.update({ where: { id: params.serverId }, data });
  return NextResponse.json({ server });
}

function isServerImageUrl(url: string): boolean {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (base && url.startsWith(`${base}/storage/v1/object/public/`)) return true;
  if (url.startsWith("https://static.klipy.com/")) return true;
  return false;
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
