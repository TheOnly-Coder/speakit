import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { z } from "zod";

export async function POST(req: Request, { params }: { params: { messageId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = z.object({ emoji: z.string().min(1).max(16) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id: params.messageId }, include: { channel: true } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: msg.channel.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId: msg.id, userId, emoji: parsed.data.emoji } },
  });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ toggled: "removed", emoji: parsed.data.emoji });
  }
  const reaction = await prisma.reaction.create({
    data: { messageId: msg.id, userId, emoji: parsed.data.emoji },
  });
  return NextResponse.json({ toggled: "added", reaction });
}
