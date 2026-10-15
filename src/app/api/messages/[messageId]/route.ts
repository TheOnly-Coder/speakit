import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

export async function PATCH(req: Request, { params }: { params: { messageId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const msg = await prisma.message.findUnique({ where: { id: params.messageId }, include: { channel: true } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg.authorId !== userId) return NextResponse.json({ error: "Only the author can edit" }, { status: 403 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: msg.channel.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const parsed = z.object({ content: z.string().min(1).max(500) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Keep messages under 500 characters" }, { status: 400 });
  const clean = parsed.data.content.trim().slice(0, 500);
  if (!clean) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  const updated = await prisma.message.update({
    where: { id: msg.id },
    data: { content: clean, edited: true },
    include: { author: true, replyTo: { include: { author: true } }, reactions: true },
  });
  return NextResponse.json({ message: updated });
}

export async function DELETE(_req: Request, { params }: { params: { messageId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const msg = await prisma.message.findUnique({ where: { id: params.messageId }, include: { channel: true } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canManage = await hasPermission(userId, msg.channel.serverId, "manageMessages");
  if (msg.authorId !== userId && !canManage) return NextResponse.json({ error: "Cannot delete" }, { status: 403 });
  if (msg.authorId === userId && !canManage) {
    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: msg.channel.serverId } },
    });
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.message.delete({ where: { id: msg.id } });
  return NextResponse.json({ ok: true, channelId: msg.channelId, id: msg.id });
}
