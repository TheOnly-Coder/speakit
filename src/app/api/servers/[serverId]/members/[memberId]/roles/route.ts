import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

const bodySchema = z.object({ roleId: z.string().min(1), action: z.enum(["add", "remove"]) });

/** Assign or remove a role on a member. */
export async function POST(req: Request, { params }: { params: { serverId: string; memberId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageRoles"))) {
    return NextResponse.json({ error: "Missing permission: Manage roles" }, { status: 403 });
  }
  const member = await prisma.serverMember.findFirst({
    where: { userId: params.memberId, serverId: params.serverId },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (member.role === "owner") return NextResponse.json({ error: "Cannot change the owner's roles" }, { status: 400 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role || role.serverId !== params.serverId) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (parsed.data.action === "add") {
    await prisma.memberRole.upsert({
      where: { memberId_roleId: { memberId: member.id, roleId: role.id } },
      create: { memberId: member.id, roleId: role.id },
      update: {},
    });
  } else {
    await prisma.memberRole.deleteMany({ where: { memberId: member.id, roleId: role.id } });
  }
  return NextResponse.json({ ok: true });
}
