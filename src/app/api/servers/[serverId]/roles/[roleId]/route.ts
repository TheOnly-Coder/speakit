import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission, PERMISSIONS, isReservedRoleName } from "@/lib/permissions";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(32).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  permissions: z.array(z.string()).optional(),
});

async function getRole(serverId: string, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || role.serverId !== serverId) return null;
  return role;
}

export async function PATCH(req: Request, { params }: { params: { serverId: string; roleId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageRoles"))) {
    return NextResponse.json({ error: "Missing permission: Manage roles" }, { status: 403 });
  }
  const role = await getRole(params.serverId, params.roleId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid role data" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    if (isReservedRoleName(parsed.data.name)) {
      return NextResponse.json({ error: `"${parsed.data.name.trim()}" is reserved for the automatic Offline group and can't be used` }, { status: 400 });
    }
    data.name = parsed.data.name.trim().slice(0, 32);
  }
  if (parsed.data.color !== undefined) data.color = parsed.data.color;
  if (parsed.data.permissions !== undefined) {
    data.permissions = JSON.stringify(parsed.data.permissions.filter((p) => (PERMISSIONS as readonly string[]).includes(p)));
  }
  const updated = await prisma.role.update({ where: { id: role.id }, data });
  return NextResponse.json({ role: updated });
}

export async function DELETE(_req: Request, { params }: { params: { serverId: string; roleId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageRoles"))) {
    return NextResponse.json({ error: "Missing permission: Manage roles" }, { status: 403 });
  }
  const role = await getRole(params.serverId, params.roleId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.role.delete({ where: { id: role.id } });
  return NextResponse.json({ ok: true });
}
