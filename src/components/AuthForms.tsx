"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-speakit-bg p-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-speakit-blurple/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.06] blur-[120px]" />
      <div className="animate-fade-up relative w-full max-w-md rounded-3xl border border-white/10 bg-speakit-card/80 p-8 shadow-pop backdrop-blur-xl">
        <div className="mb-6 text-center">
          <div className="brand-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-glow">S</div>
          <h1 className="brand-text-gradient text-2xl font-black tracking-tight">Speakit</h1>
          <h2 className="mt-2 text-lg font-extrabold tracking-tight text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-speakit-muted">{subtitle}</p>
        </div>
        {children}
        <p className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-center text-[11px] leading-relaxed text-speakit-muted">
          Tip: on your phone use <b className="text-speakit-text">Share → Add to Home Screen</b> to install Speakit like an app.
        </p>
      </div>
    </div>
  );
}

const inputClsAuth =
  "w-full rounded-xl border border-white/10 bg-speakit-input px-3.5 py-2.5 text-white shadow-inner outline-none transition placeholder:text-speakit-muted/60 focus:border-speakit-blurple/60 focus:ring-2 focus:ring-speakit-blurple/30";
const labelClsAuth = "mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-speakit-muted";

export function LoginForm() {
  const { login, error } = useAuthStore();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await login(identifier, password);
    setBusy(false);
    if (ok) router.push("/");
  };

  return (
    <Shell title="Welcome back!" subtitle="Log in to continue to Speakit">
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className={labelClsAuth}>Username or email</label>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com" className={inputClsAuth} required />
        </div>
        <div>
          <label className={labelClsAuth}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputClsAuth} required />
        </div>
        {error && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 ring-1 ring-rose-500/25">{error}</div>}
        <button disabled={busy} className="brand-gradient w-full rounded-xl py-2.5 text-sm font-extrabold text-white shadow-glow transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">
          {busy ? "Logging in…" : "Log In"}
        </button>
        <div className="text-center text-sm text-speakit-muted">
          New here? <Link href="/register" className="font-bold text-speakit-accent hover:text-white hover:underline">Create an account</Link>
        </div>
      </form>
    </Shell>
  );
}

export function RegisterForm() {
  const { register, resend, error, notice, retryAfter } = useAuthStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Supabase enforces ~60s between confirmation emails per address.
  // A visible countdown stops users hammering Register/Resend into a 429.
  useEffect(() => {
    if (retryAfter) setCooldown(retryAfter);
  }, [retryAfter]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    setBusy(true);
    const ok = await register(email, username, displayName || username, password);
    setBusy(false);
    if (ok) router.push("/");
  };

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setBusy(true);
    await resend(email);
    setBusy(false);
  };

  return (
    <Shell title="Create an account" subtitle="Join Speakit in seconds">
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className={labelClsAuth}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClsAuth} required maxLength={128} />
        </div>
        <div>
          <label className={labelClsAuth}>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="letters, numbers, _ and ." className={inputClsAuth} required minLength={2} maxLength={24} />
        </div>
        <div>
          <label className={labelClsAuth}>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Alex" className={inputClsAuth} required maxLength={32} />
        </div>
        <div>
          <label className={labelClsAuth}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className={inputClsAuth} required minLength={6} />
        </div>
        {error && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 ring-1 ring-rose-500/25">{error}</div>}
        {notice && <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/25">{notice}</div>}
        {cooldown > 0 && (
          <div className="text-sm text-speakit-muted">You can try again in {cooldown}s — please wait before resending.</div>
        )}
        <button disabled={busy || cooldown > 0} className="brand-gradient w-full rounded-xl py-2.5 text-sm font-extrabold text-white shadow-glow transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">
          {busy ? "Creating…" : cooldown > 0 ? `Wait ${cooldown}s…` : "Create Account"}
        </button>
        {email.includes("@") && (notice || error) && (
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || cooldown > 0}
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend confirmation email"}
          </button>
        )}
        <div className="text-center text-sm text-speakit-muted">
          Have an account? <Link href="/login" className="font-bold text-speakit-accent hover:text-white hover:underline">Log in</Link>
        </div>
      </form>
    </Shell>
  );
}
