import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { isAvatarUrl } from "@/lib/attachments";
import { z } from "zod";

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = z.object({
    displayName: z.string().min(1).max(32).optional(),
    customStatus: z.string().max(128).optional(),
    status: z.enum(["online", "idle", "dnd", "invisible"]).optional(),
    avatarUrl: z.string().max(2048).optional(),
    bannerUrl: z.string().max(2048).optional(),
    bio: z.string().max(500).optional(),
    links: z.string().max(2048).optional(),
    nameFont: z.string().max(64).optional(),
    nameColor: z.string().max(32).optional(),
    nameGradient: z.string().max(256).optional(),
  }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile data" }, { status: 400 });
  for (const key of ["avatarUrl", "bannerUrl"] as const) {
    const v = parsed.data[key];
    if (v !== undefined && v !== "" && !isAvatarUrl(v)) {
      return NextResponse.json({ error: "Invalid profile image" }, { status: 400 });
    }
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(parsed.data.displayName ? { displayName: parsed.data.displayName.trim() } : {}),
      ...(parsed.data.customStatus !== undefined ? { customStatus: parsed.data.customStatus.slice(0, 128) } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl.slice(0, 2048) } : {}),
      ...(parsed.data.bannerUrl !== undefined ? { bannerUrl: parsed.data.bannerUrl.slice(0, 2048) } : {}),
      ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio.slice(0, 500) } : {}),
      ...(parsed.data.links !== undefined ? { links: parsed.data.links.slice(0, 2048) } : {}),
      ...(parsed.data.nameFont !== undefined ? { nameFont: parsed.data.nameFont.slice(0, 64) } : {}),
      ...(parsed.data.nameColor !== undefined ? { nameColor: parsed.data.nameColor.slice(0, 32) } : {}),
      ...(parsed.data.nameGradient !== undefined ? { nameGradient: parsed.data.nameGradient.slice(0, 256) } : {}),
    },
  });
  return NextResponse.json({
    user: { id: updated.id, email: updated.email, username: updated.username, displayName: updated.displayName, avatarColor: updated.avatarColor, avatarUrl: updated.avatarUrl, bannerUrl: updated.bannerUrl, status: updated.status, customStatus: updated.customStatus, bio: updated.bio, links: updated.links, nameFont: updated.nameFont, nameColor: updated.nameColor, nameGradient: updated.nameGradient },
  });
}
