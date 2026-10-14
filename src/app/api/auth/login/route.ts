import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { normalizeUsername, ensureForceJoin } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { toSafeUser } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter your username/email and password" }, { status: 400 });
    }
    const raw = parsed.data.identifier.trim();
    const email = raw.includes("@")
      ? raw.toLowerCase()
      : (
          await prisma.user.findUnique({ where: { username: normalizeUsername(raw) } })
        )?.email;

    if (!email) return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.password,
    });
    if (error || !data.user) {
      const needsConfirm = /confirm|verified|confirmation/i.test(error?.message ?? "");
      return NextResponse.json(
        { error: needsConfirm ? "Please confirm your email first — check your inbox" : "Invalid username or password" },
        { status: 401 }
      );
    }

    const profile = await prisma.user.findUnique({ where: { authId: data.user.id } });
    if (!profile) return NextResponse.json({ error: "Account profile missing — please register again" }, { status: 404 });
    await ensureForceJoin(profile.id);
    return NextResponse.json({ user: toSafeUser(profile) });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
