import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { avatarColorFor, normalizeUsername, ensureForceJoin } from "@/lib/auth";
import { registerSchema } from "@/lib/validations";
import { toSafeUser } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const username = normalizeUsername(parsed.data.username);
    if (username.length < 2) return NextResponse.json({ error: "Username too short" }, { status: 400 });

    const [usernameTaken, emailTaken] = await Promise.all([
      prisma.user.findUnique({ where: { username } }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    if (usernameTaken) return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    if (emailTaken) return NextResponse.json({ error: "Email is already registered — try logging in" }, { status: 409 });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: parsed.data.password,
      options: { data: { username, display_name: parsed.data.displayName.trim() } },
    });
    if (error || !data.user) {
      const msg = error?.message ?? "Sign up failed";
      const taken = /already|exists|registered/i.test(msg);
      return NextResponse.json({ error: msg }, { status: taken ? 409 : 400 });
    }

    const profile = await prisma.user.create({
      data: {
        authId: data.user.id,
        email,
        username,
        displayName: parsed.data.displayName.trim().slice(0, 32),
        avatarColor: avatarColorFor(username),
      },
    });

    // If email confirmation is ON in Supabase, there is no session yet —
    // the client shows a "check your inbox" notice instead of entering the app.
    if (!data.session) {
      return NextResponse.json({ needsConfirmation: true, email });
    }
    await ensureForceJoin(profile.id);
    return NextResponse.json({ user: toSafeUser(profile) });
  } catch (e) {
    console.error("register error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
