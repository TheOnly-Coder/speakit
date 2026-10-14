"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls, PrimaryButton } from "./ui";
import { Avatar } from "./Avatar";
import { BackgroundSettings } from "./BackgroundSettings";
import { InstallPrompt } from "./InstallPrompt";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useLocalAppearance } from "@/store/useLocalAppearance";
import { BotsSettings } from "./BotsSettings";

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

export function CreateChannelModal({ open, onClose, defaultType, categoryId }: { open: boolean; onClose: () => void; defaultType: "TEXT" | "VOICE"; categoryId?: string | null }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"TEXT" | "VOICE">(defaultType);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { activeServerId } = useAppStore();

  useEffect(() => {
    if (open) setType(defaultType);
  }, [open, defaultType]);

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
        body: JSON.stringify({ name: clean, type, categoryId: categoryId ?? null }),
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
      try {
        const { getSocket } = await import("@/lib/socket");
        if (data.receiverId) getSocket().emit("friend:refresh", { userIds: [data.receiverId] });
      } catch {
        /* ignore */
      }
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
  const [tab, setTab] = useState<"account" | "profile" | "bots" | "appearance" | "notifications" | "keybinds" | "app">("account");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? "");
  const [status, setStatus] = useState(user?.status ?? "online");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(user?.bannerUrl ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    if (open && user) {
      setDisplayName(user.displayName);
      setCustomStatus(user.customStatus);
      setStatus(user.status);
      setAvatarUrl(user.avatarUrl ?? "");
      setBannerUrl(user.bannerUrl ?? "");
      setMsg("");
      setTab("account");
    }
  }, [open, user]);

  // Esc closes, like Discord.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const uploadImage = async (file: File | undefined, kind: "avatar" | "banner") => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setMsg("Must be an image (GIFs work too — even animated ones)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg("Must be under 8 MB");
      return;
    }
    if (kind === "avatar") setUploadingAvatar(true);
    else setUploadingBanner(true);
    setMsg("");
    try {
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        setMsg(`Upload failed: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      if (kind === "avatar") setAvatarUrl(data.publicUrl);
      else setBannerUrl(data.publicUrl);
      setMsg(`${kind === "avatar" ? "Avatar" : "Banner"} uploaded — hit Save to apply ✓`);
    } finally {
      setUploadingAvatar(false);
      setUploadingBanner(false);
    }
  };

  const uploadAvatar = async (file: File | undefined) => uploadImage(file, "avatar");

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, customStatus, status, avatarUrl, bannerUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Failed to save");
        return;
      }
      setUser({ ...user!, displayName: data.user.displayName, customStatus: data.user.customStatus, status: data.user.status, avatarUrl: data.user.avatarUrl, bannerUrl: data.user.bannerUrl });
      // Live-broadcast so friends see the new status instantly.
      try {
        const { getSocket } = await import("@/lib/socket");
        getSocket().emit("presence:set", { status: data.user.status });
      } catch {
        /* offline — server restores it on reconnect */
      }
      setMsg("Saved ✓");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const tabs = [
    { id: "account" as const, label: "My Account" },
    { id: "profile" as const, label: "Profiles" },
    { id: "bots" as const, label: "Bots" },
    { id: "appearance" as const, label: "Appearance" },
    { id: "notifications" as const, label: "Notifications" },
    { id: "keybinds" as const, label: "Shortcuts" },
    { id: "app" as const, label: "Install App" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      {/* Discord-style: sidebar + content, full-height on desktop */}
      <div className="relative m-auto flex h-[min(640px,92dvh)] max-h-[92dvh] w-[min(960px,94vw)] overflow-hidden rounded-xl bg-speakit-sidebar shadow-2xl">
        <div className="hidden w-56 shrink-0 flex-col bg-[#1e1f22] p-3 sm:flex">
          <div className="px-2 py-2 text-[11px] font-bold uppercase text-speakit-muted">User Settings</div>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`mb-0.5 rounded px-2.5 py-1.5 text-left text-sm font-medium ${tab === t.id ? "bg-white/10 text-white" : "text-speakit-muted hover:bg-white/5 hover:text-speakit-text"}`}
            >
              {t.label}
            </button>
          ))}
          <div className="mt-auto border-t border-white/10 px-2 pt-2 text-[11px] text-speakit-muted">
            Signed in as @{user?.username}
            <button onClick={onClose} className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-white/20 px-2 py-1.5 text-xs font-bold text-white hover:bg-white/10">
              Close <span className="rounded bg-white/10 px-1">ESC</span>
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-black/30 p-2 sm:hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded px-2.5 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-speakit-blurple text-white" : "text-speakit-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {tab === "account" && (
              <div>
                <h2 className="mb-1 text-lg font-black text-white">My Account</h2>
                <p className="mb-4 text-sm text-speakit-muted">How you appear everywhere on Speakit. Same idea as Discord&apos;s My Account.</p>
                <div className="mb-4 flex items-center gap-4 rounded-lg bg-black/20 p-3">
                  <Avatar name={displayName || user?.displayName || "?"} color={user?.avatarColor || "#5865f2"} src={avatarUrl || undefined} size={64} status={status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{displayName || user?.displayName}</div>
                    <div className="truncate text-xs text-speakit-muted">@{user?.username} • {user?.email}</div>
                  </div>
                  <label className="shrink-0 cursor-pointer rounded-md bg-speakit-blurple px-3 py-2 text-xs font-semibold text-white hover:bg-[#4752c4]">
                    {uploadingAvatar ? "Uploading…" : "Change avatar"}
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" disabled={uploadingAvatar} onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
                  </label>
                </div>
                {avatarUrl && (
                  <button onClick={() => setAvatarUrl("")} className="mb-3 text-xs text-speakit-muted hover:text-red-400">Remove avatar</button>
                )}
                <Field label="Display name">
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} maxLength={32} />
                </Field>
                <Field label="Custom status">
                  <input value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} placeholder="e.g. grinding ranked 🎮" className={inputCls} maxLength={128} />
                </Field>
                <Field label="Online status">
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                    <option value="online">🟢 Online</option>
                    <option value="idle">🌙 Idle</option>
                    <option value="dnd">⛔ Do not disturb</option>
                    <option value="invisible">⚫ Invisible</option>
                  </select>
                </Field>
                {msg && <div className="mb-3 text-sm text-green-400">{msg}</div>}
                <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</PrimaryButton>
              </div>
            )}

            {tab === "profile" && (
              <div>
                <h2 className="mb-1 text-lg font-black text-white">Profiles</h2>
                <p className="mb-4 text-sm text-speakit-muted">Your banner shows on your profile card. Animated GIFs work.</p>
                <div className="mb-3 h-28 w-full overflow-hidden rounded-lg bg-cover bg-center" style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : { backgroundColor: user?.avatarColor || "#5865f2" }} />
                <div className="mb-3 flex items-center gap-2">
                  <label className="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">
                    {uploadingBanner ? "Uploading…" : bannerUrl ? "Replace banner" : "Upload banner"}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingBanner} onChange={(e) => void uploadImage(e.target.files?.[0], "banner")} />
                  </label>
                  {bannerUrl && <button onClick={() => setBannerUrl("")} className="text-xs text-speakit-muted hover:text-red-400">Remove</button>}
                </div>
                <div className="rounded-lg bg-black/20 p-3 text-xs text-speakit-muted">
                  Preview: other people see this when they click your name — same as Discord profiles.
                </div>
                {msg && <div className="mb-3 mt-2 text-sm text-green-400">{msg}</div>}
                <div className="mt-3"><PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Profile"}</PrimaryButton></div>
              </div>
            )}

            {tab === "appearance" && <AppearanceTab />}
            {tab === "notifications" && <NotificationsTab />}
            {tab === "keybinds" && <KeybindsTab />}
            {tab === "app" && <InstallTab />}
            {tab === "bots" && <BotsSettings />}
          </div>
        </div>

        <button onClick={onClose} className="absolute right-3 top-3 hidden rounded-full border border-white/20 p-1.5 text-speakit-muted hover:text-white sm:block" title="Close (Esc)">
          ✕
        </button>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { theme, toggle } = useThemeStore();
  const patch = useLocalAppearance((s) => s.patch);
  const fontScale = useLocalAppearance((s) => s.fontScale);
  const compact = useLocalAppearance((s) => s.compact);
  const showTimestamps = useLocalAppearance((s) => s.showTimestamps);
  const reduceMotion = useLocalAppearance((s) => s.reduceMotion);
  const enterToSend = useLocalAppearance((s) => s.enterToSend);
  const sidebarWidth = useLocalAppearance((s) => s.sidebarWidth);
  const railWidth = useLocalAppearance((s) => s.railWidth);
  const msgSpacing = useLocalAppearance((s) => s.msgSpacing);
  const slimTopBar = useLocalAppearance((s) => s.slimTopBar);

  return (
    <div>
      <h2 className="mb-1 text-lg font-black text-white">Appearance</h2>
      <p className="mb-4 text-sm text-speakit-muted">Theme, background, and reading comfort. Everything here is per-device, like Discord clients.</p>

      <div className="mb-2 text-xs font-bold uppercase text-speakit-muted">Theme</div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { if ((theme === "dark") !== (t === "dark")) toggle(); }}
            className={`rounded-lg border-2 p-3 text-left ${theme === t ? "border-speakit-blurple" : "border-transparent bg-black/20"}`}
          >
            <div className={`mb-2 h-12 rounded ${t === "dark" ? "bg-[#1e1f22]" : "bg-[#f2f3f5]"}`} />
            <div className="text-sm font-semibold capitalize text-white">{t}</div>
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-lg bg-black/20 p-3">
        <BackgroundSettings />
      </div>

      <div className="mb-2 text-xs font-bold uppercase text-speakit-muted">Message display</div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button onClick={() => patch({ compact: false })} className={`rounded-lg p-3 text-left ${!compact ? "bg-speakit-blurple text-white" : "bg-black/20 text-speakit-muted"}`}>
          <div className="text-sm font-bold">Cozy</div>
          <div className="text-[11px] opacity-80">Big avatars, like Discord default</div>
        </button>
        <button onClick={() => patch({ compact: true })} className={`rounded-lg p-3 text-left ${compact ? "bg-speakit-blurple text-white" : "bg-black/20 text-speakit-muted"}`}>
          <div className="text-sm font-bold">Compact</div>
          <div className="text-[11px] opacity-80">Tight IRC-style rows</div>
        </button>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-speakit-muted">
          <span className="font-bold uppercase">Chat font size</span>
          <span>{Math.round(fontScale * 100)}%</span>
        </div>
        <input type="range" min={85} max={130} value={Math.round(fontScale * 100)} onChange={(e) => patch({ fontScale: Number(e.target.value) / 100 })} className="w-full accent-[#5865f2]" />
      </div>

      {[
        { label: "Show timestamps on messages", value: showTimestamps, key: "showTimestamps", hint: "Off = cleaner, Discord compact feel" },
        { label: "Reduce motion", value: reduceMotion, key: "reduceMotion", hint: "Disables smooth scroll + animations" },
        { label: "Enter sends message", value: enterToSend, key: "enterToSend", hint: "Off = Enter adds a new line" },
      ].map((row) => (
        <label key={row.key} className="mb-2 flex cursor-pointer items-center justify-between rounded-md bg-speakit-input px-3 py-2.5 text-sm">
          <span className="text-white">{row.label} <span className="block text-xs font-normal text-speakit-muted">{row.hint}</span></span>
          <input type="checkbox" checked={row.value} onChange={(e) => patch({ [row.key]: e.target.checked })} className="h-4 w-4 accent-[#5865f2]" />
        </label>
      ))}

      <div className="mb-2 mt-4 text-xs font-bold uppercase text-speakit-muted">Layout — panel sizes (this device only)</div>
      <p className="mb-3 text-xs text-speakit-muted">Resize the app panels to fit your screen. Applies instantly on mobile and PC.</p>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-speakit-muted">
          <span className="font-bold uppercase">Channel / DM list width</span>
          <span>{Math.round(sidebarWidth)}px</span>
        </div>
        <input type="range" min={192} max={320} step={4} value={sidebarWidth} onChange={(e) => patch({ sidebarWidth: Number(e.target.value) })} className="w-full accent-[#5865f2]" />
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-speakit-muted">
          <span className="font-bold uppercase">Server rail width</span>
          <span>{Math.round(railWidth)}px</span>
        </div>
        <input type="range" min={60} max={88} step={2} value={railWidth} onChange={(e) => patch({ railWidth: Number(e.target.value) })} className="w-full accent-[#5865f2]" />
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-speakit-muted">
          <span className="font-bold uppercase">Message spacing</span>
          <span>{Math.round(msgSpacing * 100)}%</span>
        </div>
        <input type="range" min={75} max={150} step={5} value={Math.round(msgSpacing * 100)} onChange={(e) => patch({ msgSpacing: Number(e.target.value) / 100 })} className="w-full accent-[#5865f2]" />
      </div>

      <label className="mb-2 flex cursor-pointer items-center justify-between rounded-md bg-speakit-input px-3 py-2.5 text-sm">
        <span className="text-white">Slim top bar on phones <span className="block text-xs font-normal text-speakit-muted">Hides the search pill on small screens for a taller chat</span></span>
        <input type="checkbox" checked={slimTopBar} onChange={(e) => patch({ slimTopBar: e.target.checked })} className="h-4 w-4 accent-[#5865f2]" />
      </label>

      <button
        onClick={() => patch({ sidebarWidth: 240, railWidth: 72, msgSpacing: 1, slimTopBar: false })}
        className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
      >
        Reset layout to defaults
      </button>
    </div>
  );
}

function NotificationsTab() {
  const desktopSounds = useLocalAppearance((s) => s.desktopSounds);
  const patch = useLocalAppearance((s) => s.patch);
  const { mutedChannels, mutedDMs } = useAppStore();
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const enable = async () => {
    try {
      if (!("Notification" in window)) return;
      const r = await Notification.requestPermission();
      setPerm(r);
    } catch { /* ignore */ }
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-black text-white">Notifications</h2>
      <p className="mb-4 text-sm text-speakit-muted">Just like Discord: desktop pings for @mentions, plus per-channel mutes.</p>
      <div className="mb-3 flex items-center justify-between rounded-md bg-speakit-input px-3 py-2.5 text-sm">
        <span className="text-white">Desktop pings <span className="block text-xs font-normal text-speakit-muted">When someone @mentions you and the tab is hidden</span></span>
        {perm === "granted" ? (
          <span className="rounded bg-speakit-green/20 px-2 py-1 text-xs font-bold text-speakit-green">ON</span>
        ) : (
          <button onClick={() => void enable()} className="rounded bg-speakit-blurple px-3 py-1.5 text-xs font-bold text-white">Enable</button>
        )}
      </div>
      <label className="mb-3 flex cursor-pointer items-center justify-between rounded-md bg-speakit-input px-3 py-2.5 text-sm">
        <span className="text-white">Message sounds <span className="block text-xs font-normal text-speakit-muted">Plays on this device only</span></span>
        <input type="checkbox" checked={desktopSounds} onChange={(e) => patch({ desktopSounds: e.target.checked })} className="h-4 w-4 accent-[#5865f2]" />
      </label>
      <div className="rounded-lg bg-black/20 p-3 text-xs text-speakit-muted">
        Muted channels: <b className="text-white">{mutedChannels.length}</b> · Muted DMs: <b className="text-white">{mutedDMs.length}</b>
        <div className="mt-1">Right-click any channel or DM → Mute, exactly like Discord.</div>
      </div>
    </div>
  );
}

function KeybindsTab() {
  const rows: [string, string][] = [
    ["Ctrl / ⌘ + K", "Quick Switcher — jump to servers, channels, DMs"],
    ["Esc", "Close dialogs / cancel editing"],
    ["Enter", "Send message (Shift+Enter for new line)"],
    ["↑ / ↓ in switcher", "Move between results, Enter to jump"],
    ["Right-click", "Channel, member & message actions"],
  ];
  return (
    <div>
      <h2 className="mb-1 text-lg font-black text-white">Shortcuts</h2>
      <p className="mb-4 text-sm text-speakit-muted">The same muscle memory as Discord.</p>
      <div className="space-y-1.5">
        {rows.map(([k, desc]) => (
          <div key={k} className="flex items-center gap-3 rounded-md bg-black/20 px-3 py-2">
            <kbd className="shrink-0 rounded bg-white/10 px-2 py-1 text-[11px] font-bold text-white">{k}</kbd>
            <span className="text-xs text-speakit-text">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstallTab() {
  return (
    <div>
      <h2 className="mb-1 text-lg font-black text-white">Install App</h2>
      <p className="mb-4 text-sm text-speakit-muted">Add Speakit to your home screen for full-screen, faster launches.</p>
      <InstallPrompt />
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-speakit-muted">
        <li>Works offline for the app shell; chats resync when you reconnect.</li>
        <li>Your custom background stays on each device — set it per phone/desktop.</li>
        <li>On iPhone: Share → Add to Home Screen. On Android/Chrome: Install button.</li>
      </ul>
    </div>
  );
}
