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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-speakit-bg">
      <div className="mx-auto min-h-full w-full max-w-7xl px-4 pb-16 pt-10">
        <button
          onClick={onClose}
          className="fixed right-4 top-4 rounded-full border border-white/10 bg-white/[0.06] p-2.5 text-speakit-muted backdrop-blur transition hover:bg-white/[0.12] hover:text-white"
          title="Close"
        >
          <X size={20} />
        </button>

        <h1 className="brand-text-gradient text-center text-3xl font-black tracking-tight">Find your people</h1>
        <p className="mt-1.5 text-center text-sm text-speakit-muted">
          Public servers on Speakit. Search by name, topic or tag.
        </p>

        <div className="mx-auto mt-5 max-w-md">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 shadow-inner transition focus-within:border-speakit-blurple/50 focus-within:shadow-glow focus-within:ring-2 focus-within:ring-speakit-blurple/20">
            <Search size={16} className="shrink-0 text-speakit-accent" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search servers…"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-speakit-muted/70"
            />
          </div>
        </div>

        {error && <div className="mx-auto mt-4 max-w-md rounded-2xl bg-rose-500/10 px-4 py-2 text-center text-sm font-medium text-rose-300 ring-1 ring-rose-500/25">{error}</div>}

        {loading && (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.02]">
                <div className="skeleton h-20 w-full" />
                <div className="space-y-2 p-3">
                  <div className="skeleton h-4 w-2/3 rounded-full" />
                  <div className="skeleton h-3 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className="mx-auto mt-10 max-w-md rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-speakit-muted">
            No public servers found. Servers appear here when owners turn on “List in server directory”.
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {results.map((s) => (
            <article key={s.id} className="group flex flex-col overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.03] shadow-card transition hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-pop">
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
                    className="h-12 w-12 rounded-2xl object-cover ring-4 ring-[#17171f]"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-base font-black text-white ring-4 ring-[#17171f]"
                    style={{ background: `linear-gradient(135deg, ${s.iconColor || "#6c6cf5"}, #7b5cf0)` }}
                  >
                    {(s.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-1">
                <h3 className="truncate text-[15px] font-extrabold tracking-tight text-white" title={s.name}>
                  {s.name}
                </h3>
                <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-speakit-muted">
                  {s.description || <span className="opacity-60">A community on Speakit.</span>}
                </p>
                {s.tags && s.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.tags.slice(0, 5).map((t) => (
                      <span key={t} className="rounded-full bg-speakit-blurple/15 px-2 py-0.5 text-[11px] font-semibold text-[#b5bdff] ring-1 ring-speakit-blurple/25">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="flex items-center gap-1 text-xs font-medium text-speakit-muted">
                    <Users size={13} className="text-emerald-400" />
                    {s.memberCount.toLocaleString()} members
                  </span>
                  {s.alreadyMember ? (
                    <button
                      onClick={() => void join(s.id, true)}
                      className="rounded-full px-3.5 py-1.5 text-[13px] font-bold text-speakit-muted transition hover:bg-white/[0.08] hover:text-white"
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      onClick={() => void join(s.id, false)}
                      disabled={joining === s.id}
                      className="brand-gradient rounded-full px-5 py-1.5 text-[13px] font-extrabold text-white shadow-glow transition hover:brightness-110 active:scale-95 disabled:opacity-50"
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
