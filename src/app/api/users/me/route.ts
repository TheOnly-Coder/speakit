import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId, getSessionProfile } from "@/lib/auth";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
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


export async function DELETE(req: Request) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional password confirmation (if supplied).
  let password: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.password === "string") password = body.password;
  } catch {
    /* no body */
  }
  if (password) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: session.email, password });
    if (error) return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  try {
    await prisma.user.delete({ where: { id: session.id } });
  } catch (e) {
    console.error("delete user failed", e);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  // Remove the Supabase Auth user when we have admin rights.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    try {
      const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.auth.admin.deleteUser(session.authId);
    } catch {
      /* best-effort */
    }
  }

  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
