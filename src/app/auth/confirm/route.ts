import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/** Landing route for Supabase email links (confirm signup, magic links, recovery). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";
  const ok = new URL(safeNext, url.origin);

  const supabase = await createClient();

  // PKCE flow (?code=...)
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(ok);
  }

  // Token-hash flow (?token_hash=...&type=...)
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(ok);
  }

  return NextResponse.redirect(new URL("/?error=confirm-failed", url.origin));
}
