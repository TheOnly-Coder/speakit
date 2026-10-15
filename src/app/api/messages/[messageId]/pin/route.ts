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
  const canManage = await hasPermission(userId, msg.channel.serverId, "managePins");
  if (!canManage) {
    return NextResponse.json({ error: "Missing permission: Manage pins" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = z.object({ pinned: z.boolean() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (parsed.data.pinned) {
    const count = await prisma.message.count({ where: { channelId: msg.channelId, pinned: true } });
    if (count >= 50) return NextResponse.json({ error: "Pin limit reached (50 per channel)" }, { status: 400 });
  }
  await prisma.message.update({ where: { id: msg.id }, data: { pinned: parsed.data.pinned } });
  return NextResponse.json({ ok: true, id: msg.id, channelId: msg.channelId, pinned: parsed.data.pinned });
}
