import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mentions = await prisma.mention.findMany({
    where: { userId, read: false },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const byChannel: Record<string, number> = {};
  const byDm: Record<string, number> = {};
  for (const m of mentions) {
    if (m.channelId) byChannel[m.channelId] = (byChannel[m.channelId] ?? 0) + 1;
    if (m.conversationId) byDm[m.conversationId] = (byDm[m.conversationId] ?? 0) + 1;
  }
  return NextResponse.json({
    total: mentions.length,
    byChannel,
    byDm,
    mentions: mentions.slice(0, 20).map((m) => ({
      id: m.id,
      messageId: m.messageId,
      directMessageId: m.directMessageId,
      channelId: m.channelId,
      conversationId: m.conversationId,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = z
    .object({
      channelId: z.string().optional(),
      conversationId: z.string().optional(),
      messageId: z.string().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const where: Record<string, unknown> = { userId, read: false };
  if (parsed.data.channelId) where.channelId = parsed.data.channelId;
  if (parsed.data.conversationId) where.conversationId = parsed.data.conversationId;
  if (parsed.data.messageId) where.messageId = parsed.data.messageId;
  if (!parsed.data.channelId && !parsed.data.conversationId && !parsed.data.messageId) {
    await prisma.mention.updateMany({ where: { userId, read: false }, data: { read: true } });
  } else {
    await prisma.mention.updateMany({ where: where as never, data: { read: true } });
  }
  return NextResponse.json({ ok: true });
}
