import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gifs = await prisma.favoriteGif.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ gifs });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = z.object({ url: z.string().max(2048), preview: z.string().max(2048).optional().default("") }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid GIF" }, { status: 400 });
  if (!parsed.data.url.startsWith("https://static.klipy.com/")) {
    return NextResponse.json({ error: "Only Klipy GIFs can be favorited" }, { status: 400 });
  }
  const existing = await prisma.favoriteGif.findFirst({ where: { userId, url: parsed.data.url } });
  if (existing) return NextResponse.json({ gif: existing });
  const gif = await prisma.favoriteGif.create({ data: { userId, url: parsed.data.url, preview: parsed.data.preview } });
  return NextResponse.json({ gif });
}

export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  const url = searchParams.get("url") ?? "";
  if (id) {
    const gif = await prisma.favoriteGif.findUnique({ where: { id } });
    if (!gif || gif.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.favoriteGif.delete({ where: { id } });
  } else if (url) {
    await prisma.favoriteGif.deleteMany({ where: { userId, url } });
  } else {
    return NextResponse.json({ error: "Nothing to remove" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
