import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

const emojiSchema = z.object({
  name: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and _ only"),
  url: z.string().max(2048),
});

function isEmojiUrl(url: string): boolean {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (base && url.startsWith(`${base}/storage/v1/object/public/emojis/`)) return true;
  if (url.startsWith("https://media.tenor.com/")) return true;
  return false;
}

export async function GET(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: params.serverId } },
  });
  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });
  const emojis = await prisma.customEmoji.findMany({ where: { serverId: params.serverId }, orderBy: { name: "asc" } });
  return NextResponse.json({ emojis });
}

export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageEmoji"))) {
    return NextResponse.json({ error: "Missing permission: Manage emoji" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = emojiSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid emoji" }, { status: 400 });
  if (!isEmojiUrl(parsed.data.url)) return NextResponse.json({ error: "Upload the image first (or use a Tenor GIF)" }, { status: 400 });
  const count = await prisma.customEmoji.count({ where: { serverId: params.serverId } });
  if (count >= 50) return NextResponse.json({ error: "Emoji limit reached (50 per server)" }, { status: 400 });
  try {
    const emoji = await prisma.customEmoji.create({
      data: {
        serverId: params.serverId,
        name: parsed.data.name.toLowerCase(),
        url: parsed.data.url,
        animated: parsed.data.url.toLowerCase().endsWith(".gif") || parsed.data.url.includes("tenor.com"),
      },
    });
    return NextResponse.json({ emoji });
  } catch {
    return NextResponse.json({ error: "That emoji name is taken" }, { status: 409 });
  }
}
