import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { sanitizeAttachments } from "@/lib/attachments";
import { visibleStatus } from "@/lib/presence";
import { z } from "zod";

export async function GET(req: Request, { params }: { params: { conversationId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const convo = await prisma.directConversation.findUnique({
    where: { id: params.conversationId },
    include: { participantA: true, participantB: true },
  });
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (convo.participantAId !== userId && convo.participantBId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const messages = await prisma.directMessage.findMany({
    where: { conversationId: convo.id },
    include: { author: true, attachments: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const other = convo.participantAId === userId ? convo.participantB : convo.participantA;
  return NextResponse.json({
    other: { id: other.id, username: other.username, displayName: other.displayName, avatarColor: other.avatarColor, avatarUrl: other.avatarUrl, status: visibleStatus(other.status, other.id) },
    messages: messages.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      edited: m.edited,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      author: { id: m.author.id, username: m.author.username, displayName: m.author.displayName, avatarColor: m.author.avatarColor, avatarUrl: m.author.avatarUrl },
      attachments: m.attachments.map((a) => ({ url: a.url, name: a.name, mime: a.mime })),
    })),
  });
}

export async function POST(req: Request, { params }: { params: { conversationId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const convo = await prisma.directConversation.findUnique({ where: { id: params.conversationId } });
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (convo.participantAId !== userId && convo.participantBId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = z.object({ content: z.string().max(500), attachments: z.unknown().optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  const attachments = sanitizeAttachments(parsed.data.attachments);
  const content = parsed.data.content.trim().slice(0, 500);
  if (!content && attachments.length === 0) {
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }
  const dm = await prisma.directMessage.create({
    data: {
      conversationId: convo.id,
      authorId: userId,
      content,
      attachments: attachments.length > 0 ? { create: attachments } : undefined,
    },
    include: { author: true, attachments: true },
  });
  await prisma.directConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
  return NextResponse.json({
    message: {
      id: dm.id,
      content: dm.content,
      edited: dm.edited,
      createdAt: dm.createdAt,
      author: { id: dm.author.id, username: dm.author.username, displayName: dm.author.displayName, avatarColor: dm.author.avatarColor, avatarUrl: dm.author.avatarUrl },
      attachments: dm.attachments.map((a) => ({ url: a.url, name: a.name, mime: a.mime })),
    },
  });
}
