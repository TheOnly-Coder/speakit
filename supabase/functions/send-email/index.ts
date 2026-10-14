// Supabase Edge Function: Send Email hook -> MailerSend HTTP API.
// Replaces custom SMTP: no SMTP credentials involved, delivery goes through
// your MailerSend API token instead.
//
// Deploy:
//   supabase link --project-ref rkhxcvhemmokeeugsolu
//   supabase secrets set MAILERSEND_API_TOKEN=mlsn.xxxxxxxxxxxxxxxxxxxxxxxxxx
//   supabase functions deploy send-email --no-verify-jwt
// Then: Dashboard -> Authentication -> Auth Hooks -> enable "Send Email",
// select this function. The confirmation links below reuse the
// emailRedirectTo your app already passes (/auth/confirm).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FROM_EMAIL = "noreply@willsheat.org";
const FROM_NAME = "Speakit";
const MAILERSEND_API = "https://api.mailersend.com/v1/email";

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your Speakit account",
  recovery: "Reset your Speakit password",
  magiclink: "Your Speakit login link",
  email_change: "Confirm your new email address",
  invite: "You've been invited to Speakit",
  email_change_current: "Confirm your new email address",
  email_change_new: "Confirm your new email address",
  reauthentication: "Confirm it's you on Speakit",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

serve(async (req: Request) => {
  try {
    const { user, email_data } = await req.json();
    const { token_hash, redirect_to, email_action_type, site_url } = email_data ?? {};

    if (!user?.email || !token_hash || !email_action_type || !site_url) {
      throw new Error("Missing user/email_data fields in hook payload");
    }

    // Same link Supabase would have emailed, just delivered by us.
    const actionUrl =
      `${site_url}/auth/v1/verify` +
      `?token=${encodeURIComponent(token_hash)}` +
      `&type=${encodeURIComponent(email_action_type)}` +
      `&redirect_to=${encodeURIComponent(redirect_to ?? site_url)}`;

    const subject = SUBJECTS[email_action_type] ?? "Your Speakit link";
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1e1f22;color:#fff;border-radius:12px">
        <div style="font-size:20px;font-weight:bold;margin-bottom:8px">${escapeHtml(subject)}</div>
        <p style="color:#b5bac1;font-size:14px">Click the button below to continue. This link expires soon and can only be used once.</p>
        <a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#5865f2;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Continue</a>
        <p style="color:#6d6f78;font-size:12px">Or paste this link:<br>${escapeHtml(actionUrl)}</p>
      </div>`;

    const apiToken = Deno.env.get("MAILERSEND_API_TOKEN");
    if (!apiToken) throw new Error("MAILERSEND_API_TOKEN secret is not set");

    const msRes = await fetch(MAILERSEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        from: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: user.email }],
        subject,
        html,
      }),
    });

    if (!msRes.ok) {
      const body = await msRes.text().catch(() => "");
      throw new Error(`MailerSend API ${msRes.status}: ${body.slice(0, 500)}`);
    }

    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-email hook failed:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
