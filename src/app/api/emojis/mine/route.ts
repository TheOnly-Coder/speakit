import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

/** All custom emoji from every server the user belongs to (for cross-server use). */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } });
  const ids = memberships.map((m) => m.serverId);
  if (ids.length === 0) return NextResponse.json({ emojis: [] });
  const emojis = await prisma.customEmoji.findMany({
    where: { serverId: { in: ids } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ emojis });
}
