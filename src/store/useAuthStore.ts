import { create } from "zustand";
import { createClient } from "@/lib/supabase";
import type { SafeUser } from "@/lib/types";

type AuthState = {
  user: SafeUser | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  retryAfter: number | null;
  fetchMe: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, displayName: string, password: string) => Promise<boolean>;
  resend: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (u: SafeUser | null) => void;
  clearMessages: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  notice: null,
  retryAfter: null,
  fetchMe: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      set({ user: data.user ?? null, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  login: async (identifier, password) => {
    set({ error: null, notice: null, retryAfter: null });
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      set({ error: data.error ?? "Login failed" });
      return false;
    }
    set({ user: data.user, error: null });
    return true;
  },
  register: async (email, username, displayName, password) => {
    set({ error: null, notice: null, retryAfter: null });
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, displayName, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      set({ error: data.error ?? "Registration failed", retryAfter: data.retryAfter ?? null });
      return false;
    }
    if (data.needsConfirmation) {
      set({ notice: `Account created! Check ${data.email} for a confirmation email, then log in.` });
      return false;
    }
    if (data.notice) {
      // Admin-created account that still needs a manual login.
      set({ notice: data.notice });
      return false;
    }
    set({ user: data.user, error: null });
    return true;
  },
  resend: async (email) => {
    set({ error: null, notice: null, retryAfter: null });
    const res = await fetch("/api/auth/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      set({ error: data.error ?? "Resend failed", retryAfter: data.retryAfter ?? null });
      return false;
    }
    set({ notice: `Confirmation email sent to ${data.email}. Check your inbox (and spam).` });
    return true;
  },
  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* ignore */ }
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    try {
      const { disconnectSocket } = await import("@/lib/socket");
      disconnectSocket();
    } catch { /* ignore */ }
    set({ user: null, error: null, notice: null, retryAfter: null });
  },
  setUser: (u) => set({ user: u }),
  clearMessages: () => set({ error: null, notice: null, retryAfter: null }),
}));
