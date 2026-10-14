"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Users, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

type Found = {
  id: string;
  name: string;
  iconColor: string;
  iconUrl: string;
  bannerUrl?: string;
  description?: string;
  tags?: string[];
  memberCount: number;
  alreadyMember: boolean;
};

function bannerStyle(color: string): React.CSSProperties {
  const c = color || "#5865f2";
  return { background: `linear-gradient(135deg, ${c}, #7b5cf0 60%, #4f46e5)` };
}

export function BrowseServersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState("");

  const search = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/servers/discover?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults([]);
        return;
      }
      setResults(data.servers ?? []);
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setError("");
    void search("");
  }, [open, search]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(q), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, open, search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const join = async (id: string, alreadyMember: boolean) => {
    // "Open" just jumps in without a join request.
    if (alreadyMember) {
      await useAppStore.getState().refreshServers();
      useAppStore.getState().setActiveServer(id);
      await useAppStore.getState().refreshServerDetail(id);
      onClose();
      return;
    }
    setJoining(id);
    setError("");
    try {
      const res = await fetch(`/api/servers/${id}/join`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not join");
        return;
      }
      await useAppStore.getState().refreshServers();
      useAppStore.getState().setActiveServer(id);
      await useAppStore.getState().refreshServerDetail(id);
      onClose();
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1e1f22]">
      <div className="mx-auto min-h-full w-full max-w-7xl px-4 pb-16 pt-10">
        <button
          onClick={onClose}
          className="fixed right-4 top-4 rounded-full bg-white/5 p-2 text-speakit-muted hover:bg-white/10 hover:text-white"
          title="Close"
        >
          <X size={20} />
        </button>

        <h1 className="text-center text-2xl font-black text-white">Find your people</h1>
        <p className="mt-1 text-center text-sm text-speakit-muted">
          Public servers on Speakit. Search by name, topic or tag.
        </p>

        <div className="mx-auto mt-4 max-w-md">
          <div className="flex items-center gap-2 rounded-lg border border-[#ed5b3d]/70 bg-[#2b2d31] px-3 py-2 focus-within:border-[#ed5b3d]">
            <Search size={16} className="shrink-0 text-speakit-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search servers…"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-speakit-muted"
            />
          </div>
        </div>

        {error && <div className="mx-auto mt-4 max-w-md text-center text-sm text-red-400">{error}</div>}

        {loading && <div className="mt-10 text-center text-sm text-speakit-muted">Searching…</div>}

        {!loading && results.length === 0 && (
          <div className="mt-10 text-center text-sm text-speakit-muted">
            No public servers found. Servers appear here when owners turn on “List in server directory”.
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {results.map((s) => (
            <article key={s.id} className="flex flex-col overflow-hidden rounded-xl bg-[#2b2d31] shadow-lg">
              {/* Banner */}
              <div className="h-20 w-full shrink-0 overflow-hidden" style={s.bannerUrl ? undefined : bannerStyle(s.iconColor)}>
                {s.bannerUrl ? (
                  <img src={s.bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : s.iconUrl ? (
                  <img src={s.iconUrl} alt="" className="h-full w-full object-cover opacity-40 blur-[1px]" loading="lazy" />
                ) : null}
              </div>
              {/* Icon overlapping */}
              <div className="-mt-6 ml-3">
                {s.iconUrl ? (
                  <img
                    src={s.iconUrl}
                    alt={s.name}
                    className="h-12 w-12 rounded-2xl border-4 border-[#2b2d31] bg-[#2b2d31] object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-[#2b2d31] text-base font-black text-white"
                    style={{ backgroundColor: s.iconColor || "#5865f2" }}
                  >
                    {(s.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
                <h3 className="truncate text-[15px] font-bold text-white" title={s.name}>
                  {s.name}
                </h3>
                <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-speakit-muted">
                  {s.description || <span className="opacity-60">A community on Speakit.</span>}
                </p>
                {s.tags && s.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.tags.slice(0, 5).map((t) => (
                      <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-speakit-muted">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="flex items-center gap-1 text-xs text-speakit-muted">
                    <Users size={13} className="text-[#3b82f6]" />
                    {s.memberCount.toLocaleString()} members
                  </span>
                  {s.alreadyMember ? (
                    <button
                      onClick={() => void join(s.id, true)}
                      className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-speakit-muted hover:bg-white/5 hover:text-white"
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      onClick={() => void join(s.id, false)}
                      disabled={joining === s.id}
                      className="rounded-lg bg-[#ed5b3d] px-4 py-1.5 text-[13px] font-bold text-white hover:bg-[#d94f34] disabled:opacity-50"
                    >
                      {joining === s.id ? "…" : "Join"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
