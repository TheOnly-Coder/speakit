import { create } from "zustand";
import { createClient } from "@/lib/supabase";
import type { SafeUser } from "@/lib/types";

type AuthState = {
  user: SafeUser | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  fetchMe: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, displayName: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (u: SafeUser | null) => void;
  clearMessages: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  notice: null,
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
    set({ error: null, notice: null });
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
    set({ error: null, notice: null });
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, displayName, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      set({ error: data.error ?? "Registration failed" });
      return false;
    }
    if (data.needsConfirmation) {
      set({ notice: `Account created! Check ${data.email} for a confirmation email, then log in.` });
      return false;
    }
    set({ user: data.user, error: null });
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
    set({ user: null, error: null, notice: null });
  },
  setUser: (u) => set({ user: u }),
  clearMessages: () => set({ error: null, notice: null }),
}));
