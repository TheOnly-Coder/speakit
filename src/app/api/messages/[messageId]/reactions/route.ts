import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { z } from "zod";

const CUSTOM_RE = /^:([a-z0-9_]{2,32}):$/;

export async function POST(req: Request, { params }: { params: { messageId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = z.object({ emoji: z.string().min(1).max(64) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id: params.messageId }, include: { channel: true } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: msg.channel.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const raw = parsed.data.emoji;
  const custom = CUSTOM_RE.exec(raw);
  if (custom) {
    // Custom server emoji: must exist somewhere the user can use.
    const name = custom[1];
    const mine = await prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } });
    const emoji = await prisma.customEmoji.findFirst({
      where: { name, serverId: { in: mine.map((m) => m.serverId) } },
    });
    if (!emoji) return NextResponse.json({ error: "Emoji not found" }, { status: 404 });
    if (emoji.serverId !== msg.channel.serverId) {
      const target = await prisma.server.findUnique({ where: { id: msg.channel.serverId } });
      if (!target?.allowExternalEmoji) {
        return NextResponse.json({ error: "This server doesn't allow outside emoji" }, { status: 403 });
      }
    }
  }

  const existing = await prisma.reaction.findUnique({ where: { messageId_userId_emoji: { messageId: msg.id, userId, emoji: raw } } });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ toggled: "removed", emoji: raw });
  }
  const reaction = await prisma.reaction.create({ data: { messageId: msg.id, userId, emoji: raw } });
  return NextResponse.json({ toggled: "added", reaction });
}
