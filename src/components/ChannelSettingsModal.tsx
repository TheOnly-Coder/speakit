"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls, PrimaryButton } from "./ui";
import { useAppStore } from "@/store/useAppStore";
import { getSocket } from "@/lib/socket";
import { CHANNEL_PERMS, type ChannelPerm } from "@/lib/channelPerms";

const PERM_LABELS: Record<ChannelPerm, string> = {
  view: "See this channel",
  send: "Talk / send messages",
  react: "Add reactions",
  connect: "Join voice (voice channels)",
};

type Overwrite = { target: string; allow: string[]; deny: string[] };

export function ChannelSettingsModal({ open, onClose, channelId }: { open: boolean; onClose: () => void; channelId: string | null }) {
  const { serverDetail, activeServerId, refreshServerDetail } = useAppStore();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [nameColor, setNameColor] = useState("");
  const [nameGradient, setNameGradient] = useState("");
  const [overwrites, setOverwrites] = useState<Overwrite[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const channel = serverDetail?.channels.find((c) => c.id === channelId) ?? null;

  useEffect(() => {
    if (open && channel) {
      setName(channel.name);
      setTopic(channel.topic);
      setNameColor(channel.nameColor ?? "");
      setNameGradient(channel.nameGradient ?? "");
      setMsg("");
      void fetch(`/api/channels/${channel.id}/overwrites`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setOverwrites(d.overwrites ?? []))
        .catch(() => {});
    }
  }, [open, channel]);

  const refresh = async () => {
    if (activeServerId) {
      await refreshServerDetail(activeServerId);
      try {
        getSocket().emit("server:refresh", { serverId: activeServerId });
      } catch {
        /* ignore */
      }
    }
  };

  const saveBasics = async () => {
    if (!channel || !name.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim().toLowerCase(), topic, nameColor, nameGradient }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Failed");
        return;
      }
      setMsg("Saved ✓");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setCheck = (target: string, perm: string, mode: "allow" | "deny", on: boolean) => {
    setOverwrites((prev) => {
      const rest = prev.filter((o) => o.target !== target);
      const cur = prev.find((o) => o.target === target) ?? { target, allow: [], deny: [] };
      const allow = new Set(cur.allow);
      const deny = new Set(cur.deny);
      if (mode === "allow") {
        if (on) {
          allow.add(perm);
          deny.delete(perm);
        } else allow.delete(perm);
      } else {
        if (on) {
          deny.add(perm);
          allow.delete(perm);
        } else deny.delete(perm);
      }
      const next = { target, allow: [...allow], deny: [...deny] };
      if (next.allow.length === 0 && next.deny.length === 0) return rest;
      return [...rest, next];
    });
  };

  const savePerms = async () => {
    if (!channel) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/channels/${channel.id}/overwrites`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwrites }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Failed");
        return;
      }
      setMsg("Permissions saved ✓ — hidden channels vanish for affected members");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const targets = [
    { id: "everyone", name: "@everyone" },
    ...(serverDetail?.roles ?? []).map((r) => ({ id: r.id, name: `@${r.name}` })),
  ];
  const relevant: ChannelPerm[] = channel?.type === "VOICE" ? ["view", "connect"] : ["view", "send", "react"];

  return (
    <Modal open={open} onClose={onClose} title={`#${channel?.name ?? ""} settings`}>
      {!channel && <div className="text-sm text-speakit-muted">Loading…</div>}
      {channel && (
        <>
          <Field label="Channel name">
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={32} />
              <button onClick={() => void saveBasics()} disabled={busy} className="rounded-md bg-speakit-blurple px-3 text-sm text-white disabled:opacity-50">Save</button>
            </div>
          </Field>
          {channel.type === "TEXT" && (
            <Field label="Topic">
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is this channel about?" className={inputCls} maxLength={256} />
            </Field>
          )}
          <Field label="Channel name color (hex, optional)">
            <input value={nameColor} onChange={(e) => setNameColor(e.target.value)} placeholder="#5865f2" className={inputCls} maxLength={32} />
          </Field>
          <Field label="Channel name gradient (CSS, optional)">
            <input value={nameGradient} onChange={(e) => setNameGradient(e.target.value)} placeholder="linear-gradient(90deg, #6c6cf5, #f472b6)" className={inputCls} maxLength={256} />
          </Field>
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-speakit-muted">Who can use it (✓ allow / ✕ deny, deny wins)</div>
          <div className="mb-3 max-h-56 space-y-1 overflow-y-auto">
            {targets.map((t) => {
              const ow = overwrites.find((o) => o.target === t.id);
              return (
                <div key={t.id} className="rounded-md bg-speakit-input px-3 py-2">
                  <div className="mb-1 text-sm font-semibold text-white">{t.name}</div>
                  {relevant.map((p) => (
                    <div key={p} className="flex items-center justify-between py-0.5 text-xs text-speakit-muted">
                      <span>{PERM_LABELS[p]}</span>
                      <span className="flex gap-2">
                        <label className="flex cursor-pointer items-center gap-1" title="Allow">
                          <input type="checkbox" checked={ow?.allow.includes(p) ?? false} onChange={(e) => setCheck(t.id, p, "allow", e.target.checked)} className="h-3.5 w-3.5 accent-green-500" /> ✓
                        </label>
                        <label className="flex cursor-pointer items-center gap-1" title="Deny">
                          <input type="checkbox" checked={ow?.deny.includes(p) ?? false} onChange={(e) => setCheck(t.id, p, "deny", e.target.checked)} className="h-3.5 w-3.5 accent-red-500" /> ✕
                        </label>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {msg && <div className="mb-2 text-sm text-green-400">{msg}</div>}
          <PrimaryButton onClick={() => void savePerms()} disabled={busy}>{busy ? "Saving…" : "Save permissions"}</PrimaryButton>
          <p className="mt-2 text-[11px] text-speakit-muted">Leave both boxes empty to use the server default (open to everyone).</p>
        </>
      )}
    </Modal>
  );
}
