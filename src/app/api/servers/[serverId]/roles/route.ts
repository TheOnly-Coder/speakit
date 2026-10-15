import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission, PERMISSIONS, isReservedRoleName } from "@/lib/permissions";
import { z } from "zod";

const roleSchema = z.object({
  name: z.string().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#99aab5"),
  permissions: z.array(z.string()).optional().default([]),
});

export async function GET(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: params.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });
  const roles = await prisma.role.findMany({
    where: { serverId: params.serverId },
    orderBy: { position: "asc" },
    include: { _count: { select: { memberRoles: true } } },
  });
  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: safeParse(r.permissions),
      memberCount: r._count.memberRoles,
    })),
  });
}

export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageRoles"))) {
    return NextResponse.json({ error: "Missing permission: Manage roles" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  if (isReservedRoleName(parsed.data.name)) {
    return NextResponse.json({ error: `"${parsed.data.name.trim()}" is reserved for the automatic Offline group and can't be used` }, { status: 400 });
  }
  const perms = parsed.data.permissions.filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  const count = await prisma.role.count({ where: { serverId: params.serverId } });
  const role = await prisma.role.create({
    data: { name: parsed.data.name.trim().slice(0, 32), color: parsed.data.color, permissions: JSON.stringify(perms), serverId: params.serverId, position: count },
  });
  return NextResponse.json({ role: { ...role, permissions: perms, memberCount: 0 } });
}

function safeParse(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}
