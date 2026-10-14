import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await prisma.channel.findUnique({ where: { id: params.channelId }, include: { server: true } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (channel.name === "general") return NextResponse.json({ error: "Cannot delete #general" }, { status: 400 });
  await prisma.channel.delete({ where: { id: channel.id } });
  return NextResponse.json({ ok: true });
}
