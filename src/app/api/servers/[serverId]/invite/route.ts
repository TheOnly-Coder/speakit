import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { generateInviteCode } from "@/lib/invite";
import { hasPermission } from "@/lib/permissions";

/** Regenerate the invite code (requires Manage server). */
export async function POST(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageServer"))) {
    return NextResponse.json({ error: "Missing permission: Manage server" }, { status: 403 });
  }
  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode();
    try {
      const server = await prisma.server.update({ where: { id: params.serverId }, data: { inviteCode: code } });
      return NextResponse.json({ inviteCode: server.inviteCode });
    } catch {
      /* collision — retry */
    }
  }
  return NextResponse.json({ error: "Could not generate a code, try again" }, { status: 500 });
}
