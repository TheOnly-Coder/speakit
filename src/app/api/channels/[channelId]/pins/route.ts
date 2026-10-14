import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { canInChannel } from "@/lib/channelPerms";

export async function GET(_req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await prisma.channel.findUnique({ where: { id: params.channelId } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canInChannel(userId, channel, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const pins = await prisma.message.findMany({
    where: { channelId: channel.id, pinned: true },
    include: { author: true, attachments: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    pins: pins.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      author: { id: m.author.id, username: m.author.username, displayName: m.author.displayName, avatarColor: m.author.avatarColor, avatarUrl: m.author.avatarUrl },
      attachments: m.attachments.map((a) => ({ url: a.url, name: a.name, mime: a.mime })),
    })),
  });
}
