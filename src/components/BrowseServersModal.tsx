"use client";

import { useState } from "react";
import { Compass, Search } from "lucide-react";
import { Modal, inputCls, PrimaryButton } from "./ui";
import { Avatar } from "./Avatar";
import { useAppStore } from "@/store/useAppStore";

type Found = {
  id: string;
  name: string;
  iconColor: string;
  iconUrl: string;
  memberCount: number;
  alreadyMember: boolean;
};

export function BrowseServersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState("");

  const search = async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/servers/discover?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }
      setResults(data.servers ?? []);
    } finally {
      setLoading(false);
    }
  };

  const join = async (id: string) => {
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
    <Modal open={open} onClose={onClose} title="Browse servers">
      <div className="mb-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void search(e.target.value);
          }}
          onFocus={() => void search(q)}
          placeholder="Search public servers…"
          className={inputCls}
        />
        <button onClick={() => void search(q)} className="rounded-md bg-white/10 px-3 text-white hover:bg-white/20">
          <Search size={16} />
        </button>
      </div>
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {loading && <div className="py-4 text-center text-sm text-speakit-muted">Searching…</div>}
        {!loading && results.length === 0 && (
          <div className="py-6 text-center text-sm text-speakit-muted">
            <Compass size={32} className="mx-auto mb-2 opacity-40" />
            No public servers found. Servers appear here when owners turn on “List in server directory”.
          </div>
        )}
        {results.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg bg-speakit-input px-3 py-2.5">
            {s.iconUrl ? (
              <img src={s.iconUrl} alt={s.name} className="h-10 w-10 rounded-2xl object-cover" />
            ) : (
              <Avatar name={s.name} color={s.iconColor} size={40} />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{s.name}</div>
              <div className="text-[11px] text-speakit-muted">{s.memberCount} members</div>
            </div>
            {s.alreadyMember ? (
              <button onClick={() => void join(s.id)} className="rounded bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">Open</button>
            ) : (
              <button onClick={() => void join(s.id)} disabled={joining === s.id} className="rounded bg-speakit-green px-3 py-1.5 text-xs text-white hover:bg-[#1a8a4a] disabled:opacity-50">
                {joining === s.id ? "…" : "Join"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3">
        <PrimaryButton onClick={() => void search(q)}>Refresh</PrimaryButton>
      </div>
    </Modal>
  );
}
