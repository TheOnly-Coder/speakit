import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mutes = await prisma.mute.findMany({ where: { userId } });
  return NextResponse.json({
    channels: mutes.filter((m) => m.kind === "channel").map((m) => m.targetId),
    dms: mutes.filter((m) => m.kind === "dm").map((m) => m.targetId),
  });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = z.object({ kind: z.enum(["channel", "dm"]), targetId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const existing = await prisma.mute.findUnique({
    where: { userId_kind_targetId: { userId, kind: parsed.data.kind, targetId: parsed.data.targetId } },
  });
  if (existing) {
    await prisma.mute.delete({ where: { id: existing.id } });
    return NextResponse.json({ muted: false });
  }
  await prisma.mute.create({ data: { userId, kind: parsed.data.kind, targetId: parsed.data.targetId } });
  // Muting clears its pending pings too.
  if (parsed.data.kind === "channel") {
    await prisma.mention.updateMany({ where: { userId, read: false, channelId: parsed.data.targetId }, data: { read: true } });
  } else {
    await prisma.mention.updateMany({ where: { userId, read: false, conversationId: parsed.data.targetId }, data: { read: true } });
  }
  return NextResponse.json({ muted: true });
}
