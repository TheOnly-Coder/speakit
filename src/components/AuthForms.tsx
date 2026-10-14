"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1e1f22] p-4">
      <div className="w-full max-w-md rounded-2xl bg-speakit-sidebar p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-speakit-blurple text-2xl font-black text-white">S</div>
          <h1 className="text-2xl font-black text-white">Speakit</h1>
          <h2 className="mt-2 text-lg font-bold text-white">{title}</h2>
          <p className="text-sm text-speakit-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClsAuth =
  "w-full rounded-md bg-speakit-input px-3 py-2 text-white outline-none focus:ring-2 focus:ring-speakit-blurple";
const labelClsAuth = "mb-1 block text-xs font-bold uppercase text-speakit-muted";

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
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelClsAuth}>Username or email</label>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputClsAuth} required />
        </div>
        <div>
          <label className={labelClsAuth}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClsAuth} required />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button disabled={busy} className="w-full rounded-md bg-speakit-blurple py-2 font-medium text-white hover:bg-[#4752c4] disabled:opacity-50">
          {busy ? "Logging in…" : "Log In"}
        </button>
        <div className="text-sm text-speakit-muted">
          New here? <Link href="/register" className="text-[#00a8fc] hover:underline">Register</Link>
        </div>
      </form>
    </Shell>
  );
}

export function RegisterForm() {
  const { register, error, notice } = useAuthStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await register(email, username, displayName || username, password);
    setBusy(false);
    if (ok) router.push("/");
  };

  return (
    <Shell title="Create an account" subtitle="Join Speakit in seconds">
      <form onSubmit={submit} className="space-y-3">
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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClsAuth} required minLength={6} />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        {notice && <div className="text-sm text-green-400">{notice}</div>}
        <button disabled={busy} className="w-full rounded-md bg-speakit-blurple py-2 font-medium text-white hover:bg-[#4752c4] disabled:opacity-50">
          {busy ? "Creating…" : "Register"}
        </button>
        <div className="text-sm text-speakit-muted">
          Have an account? <Link href="/login" className="text-[#00a8fc] hover:underline">Log in</Link>
        </div>
      </form>
    </Shell>
  );
}
