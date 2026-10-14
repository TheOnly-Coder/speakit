"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Headphones, Settings, LogOut } from "lucide-react";
import { Avatar } from "./Avatar";
import { useAuthStore } from "@/store/useAuthStore";
import { useVoiceStore } from "@/store/useVoiceStore";

const STATUSES = [
  { id: "online", label: "Online", dot: "bg-speakit-green" },
  { id: "idle", label: "Idle", dot: "bg-yellow-500" },
  { id: "dnd", label: "Do Not Disturb", dot: "bg-red-500" },
  { id: "invisible", label: "Invisible", dot: "bg-gray-500" },
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
      if (res.ok) useAuthStore.getState().setUser({ ...user, status: data.user.status });
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-60 overflow-hidden rounded-xl bg-[#111214] shadow-2xl ring-1 ring-black/60">
          <div className="bg-speakit-blurple/30 p-3 pb-8" />
          <div className="-mt-6 px-3">
            <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={48} status={user.status} />
            <div className="mt-1 rounded-lg bg-[#1e1f22] p-2.5">
              <div className="text-sm font-bold text-white">{user.displayName}</div>
              <div className="text-xs text-speakit-muted">@{user.username}</div>
              {user.customStatus && <div className="mt-1 text-xs text-speakit-text">{user.customStatus}</div>}
            </div>
            <div className="py-2">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void setStatus(s.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-speakit-text hover:bg-speakit-blurple hover:text-white"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
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
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-speakit-text hover:bg-speakit-blurple hover:text-white"
              >
                <Settings size={14} /> User Settings
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-red-400 hover:bg-red-500 hover:text-white"
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          </div>
          <div className="h-2" />
        </div>
      )}

      <div className="flex items-center gap-2 bg-[#232428] px-2 py-2">
        <button onClick={() => setOpen((v) => !v)} title="Set status, settings, log out" className="rounded-full hover:opacity-90">
          <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={32} status={user.status} />
        </button>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" title="Set status">
          <div className="truncate text-xs font-semibold text-white">{user.displayName}</div>
          <div className="truncate text-[11px] capitalize text-speakit-muted">{user.status === "dnd" ? "Do not disturb" : user.status}</div>
        </button>
        <button
          title={voice.selfMuted ? "Unmute" : "Mute"}
          onClick={() => useVoiceStore.getState().setSelfMuted(!voice.selfMuted)}
          className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white"
        >
          {voice.selfMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          title={voice.selfDeafened ? "Undeafen" : "Deafen"}
          onClick={() => useVoiceStore.getState().setSelfDeafened(!voice.selfDeafened)}
          className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white"
        >
          <Headphones size={16} />
        </button>
        <button title="User Settings" onClick={onOpenSettings} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
