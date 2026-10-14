import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";

const schema = z.object({ email: z.string().email().max(128) });

/**
 * Resend a signup confirmation email without re-running full signUp.
 * Single, deliberate sends burn far less of Supabase's 2-emails/hour
 * built-in quota than hammering "Register" again.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const supabase = await createClient();
    const emailRedirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin}/auth/confirm`;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });
    if (error) {
      const isRate = error.status === 429 || /rate ?limit|over_email|after \d+ second/i.test(error.message);
      if (isRate) {
        return NextResponse.json(
          {
            error:
              "Confirmation email is rate limited (Supabase allows ~2/hour on the free mailer, plus 60s between resends). Wait a minute and try once more.",
            code: "email_rate_limited",
            retryAfter: 60,
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error("resend error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
