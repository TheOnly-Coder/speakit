import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { stripDiscordMarkdown } from "@/lib/messagePreview";
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
    items: await mentionItems(userId, mentions.slice(0, 20)),
  });
}

type MentionRow = {
  id: string;
  messageId: string | null;
  directMessageId: string | null;
  channelId: string | null;
  conversationId: string | null;
  createdAt: Date;
};

/** Rich inbox rows so clients can jump straight to the ping. */
async function mentionItems(userId: string, rows: MentionRow[]) {
  const items: Record<string, unknown>[] = [];
  try {
    const msgIds = [...new Set(rows.map((m) => m.messageId).filter((x): x is string => !!x))];
    const dmIds = [...new Set(rows.map((m) => m.directMessageId).filter((x): x is string => !!x))];
    const [msgs, dms] = await Promise.all([
      msgIds.length > 0
        ? prisma.message.findMany({
            where: { id: { in: msgIds } },
            include: {
              author: { select: { displayName: true, username: true } },
              channel: { select: { id: true, name: true, serverId: true, server: { select: { id: true, name: true } } } },
            },
          })
        : Promise.resolve([]),
      dmIds.length > 0
        ? prisma.directMessage.findMany({
            where: { id: { in: dmIds } },
            include: {
              author: { select: { displayName: true, username: true } },
              conversation: {
                select: {
                  id: true,
                  participantA: { select: { id: true, displayName: true, username: true } },
                  participantB: { select: { id: true, displayName: true, username: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);
    const byMsg = new Map(msgs.map((m) => [m.id, m]));
    const byDm = new Map(dms.map((m) => [m.id, m]));
    for (const row of rows) {
      if (row.messageId) {
        const m = byMsg.get(row.messageId);
        if (!m) continue;
        items.push({
          id: row.id,
          kind: "channel",
          channelId: m.channel.id,
          channelName: m.channel.name,
          serverId: m.channel.server.id,
          serverName: m.channel.server.name,
          authorName: m.author.displayName,
          preview: stripDiscordMarkdown(m.content).slice(0, 120),
          createdAt: row.createdAt,
        });
      } else if (row.directMessageId) {
        const m = byDm.get(row.directMessageId);
        if (!m) continue;
        const other = m.conversation.participantA.id === userId ? m.conversation.participantB : m.conversation.participantA;
        items.push({
          id: row.id,
          kind: "dm",
          conversationId: m.conversation.id,
          dmName: other.displayName,
          authorName: m.author.displayName,
          preview: stripDiscordMarkdown(m.content).slice(0, 120),
          createdAt: row.createdAt,
        });
      }
    }
  } catch {
    /* inbox enrichment is best-effort */
  }
  return items;
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
