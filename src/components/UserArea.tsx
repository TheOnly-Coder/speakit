"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Headphones, Settings, LogOut } from "lucide-react";
import { Avatar } from "./Avatar";
import { useAuthStore } from "@/store/useAuthStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import { getSocket } from "@/lib/socket";

const STATUSES = [
  { id: "online", label: "Online", dot: "bg-emerald-400" },
  { id: "idle", label: "Idle", dot: "bg-amber-400" },
  { id: "dnd", label: "Do Not Disturb", dot: "bg-rose-500" },
  { id: "invisible", label: "Invisible", dot: "bg-zinc-500" },
] as const;

/**
 * Discord-style bottom-left user area: click your avatar for the status
 * picker (Online/Idle/DND/Invisible), custom status, settings + logout.
 */
export function UserArea({ onOpenSettings, onLogout }: { onOpenSettings: () => void; onLogout: () => void }) {
  const { user } = useAuthStore();
  const voice = useVoiceStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  if (!user) return null;

  const setStatus = async (status: string) => {
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok) {
        useAuthStore.getState().setUser({ ...user, status: data.user.status });
        // Live-broadcast so friends see the new status instantly.
        try {
          getSocket().emit("presence:set", { status: data.user.status });
        } catch {
          /* offline — server restores it on reconnect */
        }
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="menu-pop absolute bottom-full left-2 right-2 z-40 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#121218]/95 shadow-pop backdrop-blur-xl sm:left-2 sm:right-auto sm:w-64">
          <div className="brand-gradient h-16 p-3 pb-8 opacity-90" />
          <div className="-mt-7 px-3">
            <div className="w-fit rounded-full ring-4 ring-[#121218]">
              <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={52} status={user.status} />
            </div>
            <div className="mt-2 rounded-xl border border-white/[0.06] bg-black/40 p-2.5">
              <div className="text-sm font-extrabold text-white">{user.displayName}</div>
              <div className="text-xs text-speakit-muted">@{user.username}</div>
              {user.customStatus && <div className="mt-1 text-xs text-speakit-text">{user.customStatus}</div>}
            </div>
            <div className="py-2">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void setStatus(s.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-speakit-text transition hover:bg-speakit-blurple hover:text-white"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white/10 ${s.dot}`} />
                  {s.label}
                  {user.status === s.id && <span className="ml-auto text-[11px] opacity-60">✓</span>}
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 py-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-speakit-text transition hover:bg-speakit-blurple hover:text-white"
              >
                <Settings size={14} /> User Settings
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-rose-300 transition hover:bg-rose-500 hover:text-white"
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          </div>
          <div className="h-2" />
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-white/[0.06] bg-black/30 px-2.5 py-2 backdrop-blur">
        <button onClick={() => setOpen((v) => !v)} title="Set status, settings, log out" className="rounded-full transition hover:scale-105 hover:opacity-90 active:scale-95">
          <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={34} status={user.status} />
        </button>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left transition hover:bg-white/[0.06]" title="Set status">
          <div className="truncate text-[13px] font-bold text-white">{user.displayName}</div>
          <div className="truncate text-[11px] capitalize text-speakit-muted">{user.status === "dnd" ? "Do not disturb" : user.status}</div>
        </button>
        <button
          title={voice.selfMuted ? "Unmute" : "Mute"}
          onClick={() => useVoiceStore.getState().setSelfMuted(!voice.selfMuted)}
          className="rounded-lg p-2 text-speakit-muted transition hover:bg-white/10 hover:text-white"
        >
          {voice.selfMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          title={voice.selfDeafened ? "Undeafen" : "Deafen"}
          onClick={() => useVoiceStore.getState().setSelfDeafened(!voice.selfDeafened)}
          className="rounded-lg p-2 text-speakit-muted transition hover:bg-white/10 hover:text-white"
        >
          <Headphones size={16} />
        </button>
        <button title="User Settings" onClick={onOpenSettings} className="rounded-lg p-2 text-speakit-muted transition hover:rotate-45 hover:bg-white/10 hover:text-white">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
