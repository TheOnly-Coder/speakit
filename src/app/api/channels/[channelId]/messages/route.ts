import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { sanitizeAttachments } from "@/lib/attachments";
import { canInChannel } from "@/lib/channelPerms";
import { sendMessageSchema } from "@/lib/validations";

async function canAccessChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
  });
  if (!member) return null;
  return channel;
}

export async function GET(req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await canAccessChannel(userId, params.channelId);
  if (!channel) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canInChannel(userId, channel, "view"))) return NextResponse.json({ error: "You can't view this channel" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const messages = await prisma.message.findMany({
    where: { channelId: params.channelId },
    include: {
      author: true,
      replyTo: { include: { author: true } },
      reactions: { include: { user: true } },
      attachments: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await canAccessChannel(userId, params.channelId);
  if (!channel) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (channel.type !== "TEXT") return NextResponse.json({ error: "Cannot send messages in voice channels" }, { status: 400 });
  if (!(await canInChannel(userId, channel, "send"))) return NextResponse.json({ error: "You can't talk in this channel" }, { status: 403 });

  const body = await req.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  const attachments = sanitizeAttachments(parsed.data.attachments);
  const content = parsed.data.content.trim().slice(0, 500);
  if (!content && attachments.length === 0) {
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }

  if (parsed.data.replyToId) {
    const replyTo = await prisma.message.findUnique({ where: { id: parsed.data.replyToId } });
    if (!replyTo || replyTo.channelId !== params.channelId) {
      return NextResponse.json({ error: "Replied message not found" }, { status: 400 });
    }
  }

  const message = await prisma.message.create({
    data: {
      content,
      channelId: params.channelId,
      authorId: userId,
      replyToId: parsed.data.replyToId,
      attachments: attachments.length > 0 ? { create: attachments } : undefined,
    },
    include: { author: true, replyTo: { include: { author: true } }, reactions: true, attachments: true },
  });
  return NextResponse.json({ message });
}
