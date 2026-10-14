import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const fr = await prisma.friendship.findUnique({ where: { id: params.id } });
  if (!fr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (fr.receiverId !== userId && fr.requesterId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (action === "accept") {
    if (fr.receiverId !== userId) return NextResponse.json({ error: "Only receiver can accept" }, { status: 403 });
    const updated = await prisma.friendship.update({ where: { id: fr.id }, data: { status: "ACCEPTED" } });
    return NextResponse.json({ friendship: updated, otherUserId: fr.requesterId });
  }
  if (action === "decline" || action === "remove" || action === "cancel") {
    const otherUserId = fr.requesterId === userId ? fr.receiverId : fr.requesterId;
    await prisma.friendship.delete({ where: { id: fr.id } });
    return NextResponse.json({ ok: true, otherUserId });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fr = await prisma.friendship.findUnique({ where: { id: params.id } });
  if (!fr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (fr.receiverId !== userId && fr.requesterId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.friendship.delete({ where: { id: fr.id } });
  return NextResponse.json({ ok: true, otherUserId: fr.requesterId === userId ? fr.receiverId : fr.requesterId });
}
