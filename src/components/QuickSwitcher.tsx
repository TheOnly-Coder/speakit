"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Volume2, User, Server, Search } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export type QuickTarget =
  | { kind: "server"; id: string; label: string; sub: string }
  | { kind: "channel"; id: string; serverId: string; label: string; sub: string; voice: boolean }
  | { kind: "dm"; id: string; label: string; sub: string }
  | { kind: "friend"; id: string; label: string; sub: string };

function fuzzy(hay: string, needle: string): boolean {
  if (!needle) return true;
  const h = hay.toLowerCase();
  const n = needle.toLowerCase().trim();
  // substring first (fast path), then ordered-characters fallback
  if (h.includes(n)) return true;
  let j = 0;
  for (let i = 0; i < h.length && j < n.length; i++) {
    if (h[i] === n[j]) j++;
  }
  return j === n.length;
}

/**
 * Discord-style Quick Switcher (Ctrl+K). Jump to any server, channel, or DM
 * without touching the mouse — the #1 thing Discord users reach for.
 */
export function QuickSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { servers, serverDetail, activeServerId, conversations, friends, setActiveServer, setActiveChannel, setActiveDM } = useAppStore();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  const targets: QuickTarget[] = useMemo(() => {
    const out: QuickTarget[] = [];
    for (const s of servers) out.push({ kind: "server", id: s.id, label: s.name, sub: `${s.memberCount} members` });
    const channels = serverDetail && (!activeServerId || serverDetail.id === activeServerId) ? serverDetail.channels : [];
    for (const c of channels) {
      const sName = serverDetail && serverDetail.id === c.serverId ? serverDetail.name : "server";
      out.push({ kind: "channel", id: c.id, serverId: c.serverId, label: c.name, sub: `# in ${sName}`, voice: c.type === "VOICE" });
    }
    for (const c of conversations) out.push({ kind: "dm", id: c.id, label: c.other.displayName, sub: `@${c.other.username}` });
    for (const f of friends) {
      if (!conversations.some((c) => c.other.id === f.id)) out.push({ kind: "friend", id: f.id, label: f.displayName, sub: `@${f.username} · friend` });
    }
    return out;
  }, [servers, serverDetail, activeServerId, conversations, friends]);

  const filtered = useMemo(() => {
    const f = targets.filter((t) => fuzzy(`${t.label} ${t.sub}`, q)).slice(0, 25);
    return f;
  }, [targets, q]);

  useEffect(() => setIdx(0), [q]);

  const go = async (t: QuickTarget) => {
    if (t.kind === "server") {
      setActiveServer(t.id);
    } else if (t.kind === "channel") {
      if (t.serverId !== activeServerId) setActiveServer(t.serverId);
      setActiveChannel(t.id);
    } else if (t.kind === "dm") {
      setActiveServer(null);
      setActiveDM(t.id);
    } else {
      // friend → open or create a DM
      const existing = conversations.find((c) => c.other.id === t.id);
      if (existing) {
        setActiveServer(null);
        setActiveDM(existing.id);
      } else {
        try {
          const res = await fetch("/api/dms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: t.id }) });
          const data = await res.json();
          if (res.ok) {
            await useAppStore.getState().refreshDMs();
            setActiveServer(null);
            setActiveDM(data.conversationId);
          }
        } catch {
          /* ignore */
        }
      }
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12dvh]">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl bg-[#1e1f22] shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center gap-2 border-b border-black/30 px-4 py-3">
          <Search size={16} className="shrink-0 text-speakit-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                const t = filtered[idx];
                if (t) void go(t);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Where would you like to go? (servers, channels, people)"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-speakit-muted"
          />
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-speakit-muted">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-speakit-muted">No matches. Try a server, channel, or friend name.</div>}
          {filtered.map((t, i) => (
            <button
              key={`${t.kind}-${t.id}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => void go(t)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === idx ? "bg-speakit-blurple/30" : "hover:bg-white/5"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-speakit-muted">
                {t.kind === "channel" ? (t.voice ? <Volume2 size={15} /> : <Hash size={15} />) : t.kind === "server" ? <Server size={15} /> : <User size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {t.kind === "channel" ? "#" : ""}{t.label}
                </span>
                <span className="block truncate text-[11px] text-speakit-muted">{t.sub}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase text-speakit-muted">{t.kind}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-black/30 px-4 py-2 text-[11px] text-speakit-muted">
          <span><kbd className="rounded bg-white/10 px-1">↑↓</kbd> navigate</span>
          <span><kbd className="rounded bg-white/10 px-1">↵</kbd> jump</span>
          <span className="ml-auto">Tip: press <kbd className="rounded bg-white/10 px-1">Ctrl K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
}
