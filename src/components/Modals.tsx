"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls, PrimaryButton } from "./ui";
import { Avatar } from "./Avatar";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";

export function CreateServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Give your server a name");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create");
        return;
      }
      await useAppStore.getState().refreshServers();
      useAppStore.getState().setActiveServer(data.server.id);
      await useAppStore.getState().refreshServerDetail(data.server.id);
      setName("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create your server">
      <p className="mb-4 text-sm text-speakit-muted">Give your community a home. You can add channels later.</p>
      <Field label="Server name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gaming Hub" className={inputCls} maxLength={64} />
      </Field>
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create Server"}</PrimaryButton>
    </Modal>
  );
}

export function JoinServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) {
      setError("Enter an invite code");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/servers/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to join");
        return;
      }
      await useAppStore.getState().refreshServers();
      useAppStore.getState().setActiveServer(data.server.id);
      await useAppStore.getState().refreshServerDetail(data.server.id);
      setCode("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Join a server">
      <p className="mb-4 text-sm text-speakit-muted">Ask a friend for the 8-character invite code.</p>
      <Field label="Invite code">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. X7KQ2M9P" className={`${inputCls} uppercase tracking-widest`} maxLength={16} />
      </Field>
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Joining…" : "Join Server"}</PrimaryButton>
    </Modal>
  );
}

export function CreateChannelModal({ open, onClose, defaultType }: { open: boolean; onClose: () => void; defaultType: "TEXT" | "VOICE" }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"TEXT" | "VOICE">(defaultType);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { activeServerId } = useAppStore();

  const submit = async () => {
    const clean = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean) {
      setError("Channel name is required");
      return;
    }
    if (!/^[a-z0-9-_]+$/.test(clean)) {
      setError("Use lowercase letters, numbers, - and _");
      return;
    }
    if (!activeServerId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/servers/${activeServerId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create channel");
        return;
      }
      await useAppStore.getState().refreshServerDetail(activeServerId);
      useAppStore.getState().setActiveChannel(data.channel.id);
      setName("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create channel">
      <Field label="Channel type">
        <div className="flex gap-2">
          {(["TEXT", "VOICE"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${type === t ? "bg-speakit-blurple text-white" : "bg-speakit-input text-speakit-muted"}`}>
              {t === "TEXT" ? "# Text" : "🔊 Voice"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Channel name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. announcements" className={inputCls} maxLength={32} />
      </Field>
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create Channel"}</PrimaryButton>
    </Modal>
  );
}

export function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { serverDetail } = useAppStore();
  const [copied, setCopied] = useState(false);
  if (!serverDetail) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serverDetail.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Invite to ${serverDetail.name}`}>
      <p className="mb-3 text-sm text-speakit-muted">Share this code — anyone with it can join:</p>
      <div className="mb-4 flex items-center justify-between rounded-md bg-speakit-input px-4 py-3">
        <span className="text-xl font-bold tracking-[0.3em] text-white">{serverDetail.inviteCode}</span>
        <button onClick={copy} className="rounded bg-speakit-blurple px-3 py-1.5 text-sm text-white">{copied ? "Copied!" : "Copy"}</button>
      </div>
    </Modal>
  );
}

export function AddFriendModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim()) {
      setError("Enter a username");
      return;
    }
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      setOk(`Request sent to @${username.trim()}!`);
      setUsername("");
      await useAppStore.getState().refreshFriends();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add friend">
      <p className="mb-3 text-sm text-speakit-muted">Add by username (case-insensitive).</p>
      <Field label="Username">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. alex" className={inputCls} />
      </Field>
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      {ok && <div className="mb-3 text-sm text-green-400">{ok}</div>}
      <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send Friend Request"}</PrimaryButton>
    </Modal>
  );
}

export function NewDMModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { friends } = useAppStore();
  const [busyId, setBusyId] = useState<string | null>(null);

  const start = async (userId: string) => {
    setBusyId(userId);
    try {
      const res = await fetch("/api/dms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      const data = await res.json();
      if (res.ok) {
        await useAppStore.getState().refreshDMs();
        useAppStore.getState().setActiveDM(data.conversationId);
        onClose();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New direct message">
      {friends.length === 0 && <div className="text-sm text-speakit-muted">Add friends first, then DM them.</div>}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {friends.map((f) => (
          <button key={f.id} onClick={() => void start(f.id)} className="flex w-full items-center gap-2 rounded px-2 py-2 hover:bg-white/5">
            <span className="flex-1 text-left text-sm text-white">{f.displayName} <span className="text-speakit-muted">@{f.username}</span></span>
            <span className="text-xs text-speakit-muted">{busyId === f.id ? "…" : "Chat →"}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? "");
  const [status, setStatus] = useState(user?.status ?? "online");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (open && user) {
      setDisplayName(user.displayName);
      setCustomStatus(user.customStatus);
      setStatus(user.status);
      setAvatarUrl(user.avatarUrl ?? "");
      setMsg("");
    }
  }, [open, user]);

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) {
      setMsg("Avatar must be PNG, JPG, GIF or WebP");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg("Avatar must be under 8 MB");
      return;
    }
    setUploadingAvatar(true);
    setMsg("");
    try {
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        setMsg(`Avatar upload failed: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      setMsg("Avatar uploaded — hit Save to apply ✓");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, customStatus, status, avatarUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Failed to save");
        return;
      }
      setUser({ ...user!, displayName: data.user.displayName, customStatus: data.user.customStatus, status: data.user.status, avatarUrl: data.user.avatarUrl });
      setMsg("Saved ✓");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Your profile">
      <div className="mb-4 flex items-center gap-4">
        <Avatar name={displayName || user?.displayName || "?"} color={user?.avatarColor || "#5865f2"} src={avatarUrl || undefined} size={64} />
        <label className="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">
          {uploadingAvatar ? "Uploading…" : "Upload avatar"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            disabled={uploadingAvatar}
            onChange={(e) => void uploadAvatar(e.target.files?.[0])}
          />
        </label>
        {avatarUrl && (
          <button onClick={() => setAvatarUrl("")} className="text-xs text-speakit-muted hover:text-red-400">
            Remove
          </button>
        )}
      </div>
      <Field label="Display name">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} maxLength={32} />
      </Field>
      <Field label="Custom status">
        <input value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} placeholder="e.g. grinding ranked 🎮" className={inputCls} maxLength={128} />
      </Field>
      <Field label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="online">🟢 Online</option>
          <option value="idle">🌙 Idle</option>
          <option value="dnd">⛔ Do not disturb</option>
          <option value="invisible">⚫ Invisible</option>
        </select>
      </Field>
      {msg && <div className="mb-3 text-sm text-green-400">{msg}</div>}
      <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryButton>
      <div className="mt-3 text-xs text-speakit-muted">Signed in as @{user?.username} • {user?.email}</div>
    </Modal>
  );
}
