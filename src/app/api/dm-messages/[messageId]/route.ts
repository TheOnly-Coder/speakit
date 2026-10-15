import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { z } from "zod";

async function ownMessage(userId: string, messageId: string) {
  const msg = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });
  if (!msg) return null;
  if (msg.authorId !== userId) return "forbidden";
  const convo = msg.conversation;
  if (convo.participantAId !== userId && convo.participantBId !== userId) return "forbidden";
  return msg;
}

export async function PATCH(req: Request, { params }: { params: { messageId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const msg = await ownMessage(userId, params.messageId);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg === "forbidden") return NextResponse.json({ error: "Only the author can edit" }, { status: 403 });
  const body = await req.json();
  const parsed = z.object({ content: z.string().min(1).max(500) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Keep messages under 500 characters" }, { status: 400 });
  const clean = parsed.data.content.trim().slice(0, 500);
  if (!clean) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  const updated = await prisma.directMessage.update({
    where: { id: msg.id },
    data: { content: clean, edited: true },
  });
  return NextResponse.json({ message: updated });
}

export async function DELETE(_req: Request, { params }: { params: { messageId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const msg = await ownMessage(userId, params.messageId);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg === "forbidden") return NextResponse.json({ error: "Cannot delete" }, { status: 403 });
  await prisma.directMessage.delete({ where: { id: msg.id } });
  return NextResponse.json({ ok: true, conversationId: msg.conversationId, id: msg.id });
}
