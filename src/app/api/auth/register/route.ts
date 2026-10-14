import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { avatarColorFor, normalizeUsername, ensureForceJoin } from "@/lib/auth";
import { registerSchema } from "@/lib/validations";
import { toSafeUser } from "@/lib/types";

/** Supabase returns 429 with codes like `over_email_send_rate_limit` / `over_request_rate_limit`. */
function isRateLimitError(error: { status?: number; code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.status === 429) return true;
  return /rate ?limit|over_email|over_request|too many|after \d+ second/i.test(
    `${error.code ?? ""} ${error.message ?? ""}`
  );
}

function rateLimitResponse() {
  return NextResponse.json(
    {
      error:
        "We're sending a lot of confirmation emails right now (Supabase allows ~2/hour on the free built-in mailer). Please wait a few minutes and try again — or tap Resend confirmation once.",
      code: "email_rate_limited",
      // Hint for the client countdown UI.
      retryAfter: 60,
    },
    { status: 429 }
  );
}

function appUrl(req: Request) {
  // Used as emailRedirectTo so confirmation links land on /auth/confirm.
  // Prefer explicit site URL, fall back to request origin (works on Render).
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
}

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
    const emailRedirectTo = `${appUrl(req)}/auth/confirm`;

    // Preferred path: if a service-role key is configured, create the user via
    // the Admin API with email_confirm:true. This sends ZERO emails, so it can
    // never hit Supabase's 2-emails/hour built-in mailer limit, and the user
    // is logged in instantly. Requires SUPABASE_SERVICE_ROLE_KEY on the server.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: created, error: adminError } = await admin.auth.admin.createUser({
        email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { username, display_name: parsed.data.displayName.trim() },
      });
      if (adminError || !created.user) {
        if (isRateLimitError(adminError)) return rateLimitResponse();
        const msg = adminError?.message ?? "Sign up failed";
        const taken = /already|exists|registered/i.test(msg);
        return NextResponse.json({ error: msg }, { status: taken ? 409 : 400 });
      }

      try {
        const profile = await prisma.user.create({
          data: {
            authId: created.user.id,
            email,
            username,
            displayName: parsed.data.displayName.trim().slice(0, 32),
            avatarColor: avatarColorFor(username),
          },
        });
        // Establish the session cookies so the browser is logged in.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: parsed.data.password,
        });
        if (signInError) {
          // Profile exists but session couldn't be set (e.g. transient) —
          // user can just log in.
          return NextResponse.json({
            needsConfirmation: false,
            notice: "Account created! Please log in.",
          });
        }
        await ensureForceJoin(profile.id);
        return NextResponse.json({ user: toSafeUser(profile) });
      } catch (e) {
        // Don't leave an orphan Auth user that blocks retries with
        // "already registered" (each retry would burn more email quota).
        await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
        throw e;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: parsed.data.password,
      options: {
        data: { username, display_name: parsed.data.displayName.trim() },
        emailRedirectTo,
      },
    });
    if (error || !data.user) {
      if (isRateLimitError(error)) return rateLimitResponse();
      const msg = error?.message ?? "Sign up failed";
      const taken = /already|exists|registered/i.test(msg);
      return NextResponse.json({ error: msg }, { status: taken ? 409 : 400 });
    }

    // Supabase may return an obfuscated user with no identities when the
    // email is already in Auth (anti-enumeration). Don't create a duplicate
    // profile or send another email — point them at login/resend.
    const identities = (data.user as { identities?: unknown[] }).identities;
    if (Array.isArray(identities) && identities.length === 0) {
      return NextResponse.json(
        { error: "Email is already registered — try logging in, or resend the confirmation email" },
        { status: 409 }
      );
    }

    // signUp can return a user with no session when the address is already
    // registered but unconfirmed — don't create a duplicate Prisma profile.
    // Let the user log in / resend instead (avoids burning email quota).
    if (!data.session) {
      const existingProfile = await prisma.user.findUnique({ where: { authId: data.user.id } });
      if (existingProfile) {
        return NextResponse.json({ needsConfirmation: true, email });
      }
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
