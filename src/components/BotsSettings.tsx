"use client";

import { useEffect, useState } from "react";
import { Bot as BotIcon, Plus, Copy, Check, Trash2, Play, RefreshCw, KeyRound, Share2, Trash } from "lucide-react";
import { Avatar } from "./Avatar";
import { Field, inputCls, PrimaryButton } from "./ui";
import { BOT_EXAMPLES, MAX_BOT_CODE_LENGTH, type BotCommand } from "@/lib/bots/templates";
import { useAuthStore } from "@/store/useAuthStore";
import { BotDocs } from "./BotDocs";

type ServerRef = { id: string; name: string; iconColor?: string; iconUrl?: string };

type BotSummary = {
  id: string;
  userId: string;
  name: string;
  username: string;
  avatarColor: string;
  avatarUrl: string;
  enabled: boolean;
  shareCode: string;
  commands: BotCommand[];
  lastRunAt: string | null;
  lastError: string;
  createdAt: string;
  serverCount: number;
  servers: ServerRef[];
};

type BotDetail = BotSummary & {
  code: string;
  tokenHint: string;
  storeKeys: string[];
  updatedAt: string;
};

const AVATAR_COLORS = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#9b59b6", "#e67e22", "#1abc9c"];

export function BotsSettings() {
  const [view, setView] = useState<"bots" | "docs">("bots");
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [freshSecret, setFreshSecret] = useState<{ botId: string; botName: string; token: string; shareCode: string } | null>(null);

  const load = async (select?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/bots", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setBots(data.bots ?? []);
        const list = (data.bots ?? []) as BotSummary[];
        if (select) setSelectedId(select);
        else if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        else if (list.length === 0) setSelectedId(null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = bots.find((b) => b.id === selectedId) ?? null;

  return (
    <div>
      <h2 className="mb-1 text-lg font-black text-white">Bots</h2>
      <p className="mb-4 text-sm text-speakit-muted">
        Build chat bots with JavaScript. They join servers as members, answer{" "}
        <kbd className="rounded bg-white/10 px-1 font-bold text-white">/</kbd> commands, and react to every message.
      </p>

      <div className="mb-4 flex gap-1">
        {(["bots", "docs"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${view === v ? "bg-speakit-blurple text-white" : "text-speakit-muted hover:bg-white/5"}`}
          >
            {v === "bots" ? "My Bots" : "API Docs"}
          </button>
        ))}
      </div>

      {view === "docs" && <BotDocs />}

      {view === "bots" && (
        <>
          {freshSecret && <FreshSecretPanel secret={freshSecret} onClose={() => setFreshSecret(null)} />}

          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold uppercase text-speakit-muted">
              Your bots ({bots.length}/10)
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-md bg-speakit-green px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1a8a4a]"
            >
              <Plus size={14} /> Add a bot
            </button>
          </div>

          {loading && <div className="py-4 text-center text-sm text-speakit-muted">Loading bots…</div>}
          {!loading && bots.length === 0 && (
            <div className="mb-4 rounded-lg bg-black/20 p-5 text-center">
              <BotIcon size={32} className="mx-auto mb-2 text-speakit-muted" />
              <div className="mb-1 text-sm font-bold text-white">No bots yet</div>
              <div className="mb-3 text-xs text-speakit-muted">
                Give it a name and a picture — then teach it JavaScript. Share its code to add it to any server.
              </div>
              <button onClick={() => setShowCreate(true)} className="rounded-md bg-speakit-blurple px-4 py-2 text-xs font-bold text-white hover:bg-[#4752c4]">
                Create your first bot
              </button>
            </div>
          )}

          <div className="mb-4 space-y-1.5">
            {bots.map((b) => (
              <button
                key={b.id}
                onClick={() => { setSelectedId(b.id); setFreshSecret(null); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  selectedId === b.id ? "bg-white/10" : "bg-black/20 hover:bg-white/5"
                }`}
              >
                <Avatar name={b.name} color={b.avatarColor} src={b.avatarUrl || undefined} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-white">
                    <span className="truncate">{b.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${b.enabled ? "bg-speakit-green/20 text-speakit-green" : "bg-white/10 text-speakit-muted"}`}>
                      {b.enabled ? "ON" : "OFF"}
                    </span>
                    {b.lastError && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">ERROR</span>}
                  </span>
                  <span className="block truncate text-[11px] text-speakit-muted">
                    @{b.username} · {b.serverCount} server{b.serverCount === 1 ? "" : "s"} · {b.commands.length} command{b.commands.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <BotEditor
              key={selected.id}
              summary={selected}
              onChanged={() => void load(selected.id)}
              onDeleted={() => {
                setSelectedId(null);
                void load();
              }}
              onSecret={(s) => setFreshSecret(s)}
            />
          )}
        </>
      )}

      {showCreate && (
        <CreateBotModal
          onClose={() => setShowCreate(false)}
          onCreated={(botId, token, shareCode, name) => {
            setShowCreate(false);
            setFreshSecret({ botId, botName: name, token, shareCode });
            void load(botId);
          }}
        />
      )}
    </div>
  );
}

function FreshSecretPanel({ secret, onClose }: { secret: { botId: string; botName: string; token: string; shareCode: string }; onClose: () => void }) {
  const [copied, setCopied] = useState<"token" | "code" | null>(null);
  const copy = async (text: string, which: "token" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="mb-4 rounded-lg border border-speakit-green/40 bg-speakit-green/10 p-3">
      <div className="mb-1 text-sm font-bold text-white">“{secret.botName}” is ready ✓</div>
      <p className="mb-2 text-xs text-speakit-muted">
        The <b>token</b> is shown <b>once</b> — copy it now for scripts. The <b>share code</b> stays visible below and installs the bot into servers.
      </p>
      <div className="mb-2 flex items-center gap-2 rounded bg-black/40 px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-white">{secret.token}</span>
        <button onClick={() => void copy(secret.token, "token")} className="flex shrink-0 items-center gap-1 rounded bg-speakit-blurple px-2 py-1 text-[11px] font-bold text-white">
          {copied === "token" ? <Check size={12} /> : <Copy size={12} />} {copied === "token" ? "Copied" : "Token"}
        </button>
      </div>
      <div className="flex items-center gap-2 rounded bg-black/40 px-2.5 py-2">
        <span className="min-w-0 flex-1 font-mono text-sm font-bold tracking-[0.2em] text-white">{secret.shareCode}</span>
        <button onClick={() => void copy(secret.shareCode, "code")} className="flex shrink-0 items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] font-bold text-white hover:bg-white/20">
          {copied === "code" ? <Check size={12} /> : <Copy size={12} />} {copied === "code" ? "Copied" : "Code"}
        </button>
        <button onClick={onClose} className="shrink-0 text-[11px] text-speakit-muted hover:text-white">Dismiss</button>
      </div>
    </div>
  );
}

function CreateBotModal({ onClose, onCreated }: { onClose: () => void; onCreated: (botId: string, token: string, shareCode: string, name: string) => void }) {
  const { user } = useAuthStore();
  const [name, setName] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setError("Profile picture must be an image");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Profile picture must be under 8 MB");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `bots/${user.id}/new-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (name.trim().length < 2) {
      setError("Give your bot a name (2–32 characters)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), avatarColor, avatarUrl: avatarUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the bot");
        return;
      }
      onCreated(data.bot.id, data.token, data.shareCode, data.bot.name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-speakit-sidebar p-5 shadow-2xl">
        <h3 className="mb-1 text-base font-black text-white">Add a bot</h3>
        <p className="mb-4 text-xs text-speakit-muted">Pick a name and picture — you&apos;ll write its code next.</p>
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-black/20 p-3">
          <Avatar name={name || "?"} color={avatarColor} src={avatarUrl || undefined} size={56} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{name || "Your bot"}</div>
            <div className="text-[11px] text-speakit-muted">Shows in chat with a BOT tag</div>
          </div>
        </div>
        <Field label="Bot name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Helper" className={inputCls} maxLength={32} />
        </Field>
        <div className="mb-3">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-speakit-muted">Avatar color</span>
          <div className="flex gap-1.5">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAvatarColor(c)}
                title={c}
                className={`h-7 w-7 rounded-full ${avatarColor === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#2b2d31]" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <Field label="Profile picture (optional image URL or upload)">
          <div className="flex gap-2">
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className={inputCls} />
            <label className="shrink-0 cursor-pointer rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20">
              {uploading ? "…" : "Upload"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
          </div>
        </Field>
        {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">Cancel</button>
          <PrimaryButton onClick={() => void create()} disabled={busy}>{busy ? "Creating…" : "Create bot"}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

type ServerOption = ServerRef & { installed: boolean };

function BotEditor({ summary, onChanged, onDeleted, onSecret }: {
  summary: BotSummary;
  onChanged: () => void;
  onDeleted: () => void;
  onSecret: (s: { botId: string; botName: string; token: string; shareCode: string }) => void;
}) {
  const { user } = useAuthStore();
  const [detail, setDetail] = useState<BotDetail | null>(null);
  const [name, setName] = useState(summary.name);
  const [avatarColor, setAvatarColor] = useState(summary.avatarColor);
  const [avatarUrl, setAvatarUrl] = useState(summary.avatarUrl);
  const [code, setCode] = useState("");
  const [commands, setCommands] = useState<BotCommand[]>(summary.commands);
  const [enabled, setEnabled] = useState(summary.enabled);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [servers, setServers] = useState<{ installed: ServerRef[]; available: ServerOption[] } | null>(null);
  const [exampleId, setExampleId] = useState("");
  const [testInput, setTestInput] = useState("/ping");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ logs: string[]; actions: { kind: string; content?: string; channelId?: string; emoji?: string }[]; error: string | null; note?: string } | null>(null);
  const [newCmdName, setNewCmdName] = useState("");
  const [newCmdDesc, setNewCmdDesc] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [d, s] = await Promise.all([
          fetch(`/api/bots/${summary.id}`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`/api/bots/${summary.id}/servers`, { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (d.bot) {
          const b = d.bot as BotDetail;
          setDetail(b);
          setName(b.name);
          setAvatarColor(b.avatarColor);
          setAvatarUrl(b.avatarUrl);
          setCode(b.code);
          setCommands(b.commands);
          setEnabled(b.enabled);
        }
        if (s.installed) setServers({ installed: s.installed, available: s.available ?? [] });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summary.id]);

  const dirty =
    !!detail &&
    (name !== detail.name || avatarColor !== detail.avatarColor || avatarUrl !== detail.avatarUrl ||
      code !== detail.code || enabled !== detail.enabled ||
      JSON.stringify(commands) !== JSON.stringify(detail.commands));

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/bots/${summary.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), avatarColor, avatarUrl: avatarUrl.trim(), code, enabled, commands }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Couldn't save");
        setMsgOk(false);
        return;
      }
      setDetail(data.bot);
      setMsg("Saved ✓ — live in every server right now.");
      setMsgOk(true);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setMsg("Profile picture must be an image");
      setMsgOk(false);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg("Profile picture must be under 8 MB");
      setMsgOk(false);
      return;
    }
    setUploading(true);
    try {
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `bots/${user.id}/${summary.userId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setMsg(`Upload failed: ${upErr.message}`);
        setMsgOk(false);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      setMsg("Picture uploaded — hit Save to apply.");
      setMsgOk(true);
    } finally {
      setUploading(false);
    }
  };

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    const res = await fetch(`/api/bots/${summary.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (res.ok) {
      setMsg(next ? "Bot enabled ✓" : "Bot paused — it won't answer anywhere until re-enabled.");
      setMsgOk(true);
      onChanged();
    } else {
      setEnabled(!next);
    }
  };

  const runTest = async () => {
    if (!testInput.trim()) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/bots/${summary.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: testInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ logs: [], actions: [], error: data.error ?? "Test failed" });
        return;
      }
      setTestResult(data);
    } finally {
      setTestBusy(false);
    }
  };

  const addBotToServer = async (serverId: string) => {
    const res = await fetch(`/api/bots/${summary.id}/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Couldn't add the bot there");
      setMsgOk(false);
      return;
    }
    setMsg("Bot added ✓");
    setMsgOk(true);
    const s = await fetch(`/api/bots/${summary.id}/servers`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (s?.installed) setServers({ installed: s.installed, available: s.available ?? [] });
    onChanged();
  };

  const removeBotFromServer = async (serverId: string, serverName: string) => {
    if (!confirm(`Remove "${summary.name}" from "${serverName}"?`)) return;
    await fetch(`/api/bots/${summary.id}/servers/${serverId}`, { method: "DELETE" });
    const s = await fetch(`/api/bots/${summary.id}/servers`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (s?.installed) setServers({ installed: s.installed, available: s.available ?? [] });
    onChanged();
  };

  const regenToken = async () => {
    if (!confirm("Regenerate the token? Scripts using the old token stop working immediately.")) return;
    const res = await fetch(`/api/bots/${summary.id}/token`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Couldn't regenerate");
      setMsgOk(false);
      return;
    }
    const d = await fetch(`/api/bots/${summary.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.bot) setDetail(d.bot);
    onSecret({ botId: summary.id, botName: summary.name, token: data.token, shareCode: detail?.shareCode ?? summary.shareCode });
  };

  const regenShareCode = async () => {
    if (!confirm("New share code? The old code stops working — servers already joined keep the bot.")) return;
    const res = await fetch(`/api/bots/${summary.id}/share-code`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Couldn't regenerate");
      setMsgOk(false);
      return;
    }
    const d = await fetch(`/api/bots/${summary.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.bot) setDetail(d.bot);
    setMsg(`New share code: ${data.shareCode}`);
    setMsgOk(true);
    onChanged();
  };

  const resetMemory = async () => {
    if (!confirm("Erase this bot's memory (all store keys)?")) return;
    await fetch(`/api/bots/${summary.id}/store`, { method: "DELETE" });
    const d = await fetch(`/api/bots/${summary.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.bot) setDetail(d.bot);
    setMsg("Memory erased ✓");
    setMsgOk(true);
  };

  const deleteBot = async () => {
    if (!confirm(`Delete "${summary.name}" forever? It leaves every server and its messages disappear.`)) return;
    if (!confirm("Really sure? This can't be undone.")) return;
    await fetch(`/api/bots/${summary.id}`, { method: "DELETE" });
    onDeleted();
  };

  const copyShareCode = async () => {
    try {
      await navigator.clipboard.writeText(detail?.shareCode ?? summary.shareCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const insertExample = () => {
    const ex = BOT_EXAMPLES.find((e) => e.id === exampleId);
    if (!ex) return;
    if (code.trim() && !confirm("Replace your current code with this example?")) return;
    setCode(ex.code);
    setExampleId("");
    setMsg("Example loaded — hit Save to make it live.");
    setMsgOk(true);
  };

  if (!detail) return <div className="py-4 text-center text-sm text-speakit-muted">Loading “{summary.name}”…</div>;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      {/* Header: identity + enable switch */}
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={name || "?"} color={avatarColor} src={avatarUrl || undefined} size={52} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-white">{name || "Unnamed bot"}</div>
          <div className="truncate text-xs text-speakit-muted">
            @{detail.username} · {detail.serverCount} server{detail.serverCount === 1 ? "" : "s"}
            {detail.lastError ? <span className="ml-1 text-red-400">· last run failed</span> : detail.lastRunAt ? <span className="ml-1 text-speakit-green">· healthy</span> : <span className="ml-1">· never ran</span>}
          </div>
        </div>
        <button
          onClick={() => void toggleEnabled()}
          title={enabled ? "Pause the bot everywhere" : "Enable the bot"}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-speakit-green" : "bg-white/15"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* Profile */}
      <Section title="Profile" hint="Name and picture show in chat with a BOT tag.">
        <Field label="Bot name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={32} />
        </Field>
        <div className="mb-3">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-speakit-muted">Avatar color</span>
          <div className="flex gap-1.5">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAvatarColor(c)}
                title={c}
                className={`h-7 w-7 rounded-full ${avatarColor === c ? "ring-2 ring-white ring-offset-2 ring-offset-black/40" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <Field label="Profile picture (image URL or upload)">
          <div className="flex gap-2">
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className={inputCls} />
            <label className="shrink-0 cursor-pointer rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20">
              {uploading ? "…" : "Upload"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
            </label>
          </div>
        </Field>
      </Section>

      {/* Share code */}
      <Section title="Share code" hint="Anyone with Manage Server can paste this into Server Settings → Bots to install your bot.">
        <div className="flex items-center gap-2 rounded-md bg-black/40 px-3 py-2.5">
          <Share2 size={15} className="shrink-0 text-speakit-muted" />
          <span className="flex-1 font-mono text-lg font-bold tracking-[0.25em] text-white">{detail.shareCode}</span>
          <button onClick={() => void copyShareCode()} className="flex items-center gap-1 rounded bg-speakit-blurple px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#4752c4]">
            {copiedCode ? <Check size={12} /> : <Copy size={12} />} {copiedCode ? "Copied" : "Copy"}
          </button>
          <button onClick={() => void regenShareCode()} title="Get a new code (old one stops working)" className="flex items-center gap-1 rounded bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/20">
            <RefreshCw size={12} /> New
          </button>
        </div>
      </Section>

      {/* Commands */}
      <Section title={`Commands (${commands.length}/12)`} hint="Exposed in the / autocomplete menu. People run /name — your code matches it with util.cmd(text, &quot;name&quot;). No commands? The bot just runs its code on every message.">
        <div className="mb-2 space-y-1.5">
          {commands.map((c, i) => (
            <div key={`${c.name}-${i}`} className="flex items-center gap-2 rounded-md bg-black/30 px-2.5 py-1.5">
              <span className="shrink-0 font-mono text-xs font-bold text-[#b5bdff]">/{c.name}</span>
              <input
                value={c.description}
                onChange={(e) => setCommands((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value.slice(0, 100) } : x)))}
                placeholder="What does it do? (shown in the menu)"
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-speakit-muted"
                maxLength={100}
              />
              <button
                onClick={() => setCommands((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 rounded p-1 text-speakit-muted hover:text-red-400"
                title="Remove command"
              >
                <Trash size={13} />
              </button>
            </div>
          ))}
          {commands.length === 0 && (
            <div className="rounded-md bg-black/30 px-3 py-2.5 text-xs text-speakit-muted">
              No commands yet — the bot still runs its code on every message. Add commands to get the / menu.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={newCmdName}
            onChange={(e) => setNewCmdName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
            placeholder="name (a–z 0–9 _ -)"
            className={`${inputCls} font-mono`}
            maxLength={24}
          />
          <input
            value={newCmdDesc}
            onChange={(e) => setNewCmdDesc(e.target.value)}
            placeholder="Short description"
            className={inputCls}
            maxLength={100}
          />
          <button
            onClick={() => {
              const n = newCmdName.trim();
              if (!n) return;
              if (commands.some((c) => c.name === n)) {
                setMsg(`Command "/${n}" already exists`);
                setMsgOk(false);
                return;
              }
              if (commands.length >= 12) {
                setMsg("Max 12 commands per bot");
                setMsgOk(false);
                return;
              }
              setCommands((prev) => [...prev, { name: n, description: newCmdDesc.trim() }]);
              setNewCmdName("");
              setNewCmdDesc("");
            }}
            disabled={!newCmdName.trim() || commands.length >= 12}
            className="shrink-0 rounded-md bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </Section>

      {/* Code */}
      <Section title="JavaScript code" hint="Runs on the server for every message in servers with this bot. onMessage only — the full API is in the docs tab.">
        <div className="mb-2 flex gap-2">
          <select value={exampleId} onChange={(e) => setExampleId(e.target.value)} className="min-w-0 flex-1 rounded-md bg-speakit-input px-2 py-1.5 text-xs text-white outline-none">
            <option value="">Insert an example…</option>
            {BOT_EXAMPLES.map((e) => (
              <option key={e.id} value={e.id}>{e.label} — {e.hint}</option>
            ))}
          </select>
          <button onClick={insertExample} disabled={!exampleId} className="shrink-0 rounded-md bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40">
            Insert
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, MAX_BOT_CODE_LENGTH))}
          spellCheck={false}
          rows={16}
          className="w-full rounded-md bg-[#111214] p-3 font-mono text-xs leading-relaxed text-speakit-text outline-none ring-1 ring-black/60 focus:ring-2 focus:ring-speakit-blurple"
        />
        <div className="mt-1 text-right text-[11px] text-speakit-muted">{code.length.toLocaleString()} / {MAX_BOT_CODE_LENGTH.toLocaleString()} chars</div>
      </Section>

      {/* Test */}
      <Section title="Try it out" hint="Dry run — writes nothing. Shows what the bot would send.">
        <div className="flex gap-2">
          <input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runTest(); } }}
            placeholder='Type as a user, e.g. "/ping"'
            className={inputCls}
            maxLength={500}
          />
          <button onClick={() => void runTest()} disabled={testBusy || !testInput.trim()} className="flex shrink-0 items-center gap-1 rounded-md bg-speakit-blurple px-3 text-xs font-bold text-white hover:bg-[#4752c4] disabled:opacity-50">
            <Play size={13} /> {testBusy ? "…" : "Run"}
          </button>
        </div>
        {testResult && (
          <div className="mt-2 rounded-md bg-[#111214] p-2.5 font-mono text-[11px]">
            {testResult.error && <div className="mb-1 text-red-400">Error: {testResult.error}</div>}
            {testResult.actions.length === 0 && !testResult.error && (
              <div className="text-speakit-muted">No reply — the code ignored this message. (Check your util.cmd names match the Commands above.)</div>
            )}
            {testResult.actions.map((a, i) => (
              <div key={i} className="mb-1 text-speakit-text">
                <span className="text-speakit-green">→ {a.kind}</span>{" "}
                {a.kind === "react" ? a.emoji : a.content}
              </div>
            ))}
            {testResult.logs.length > 0 && (
              <div className="mt-1 border-t border-white/10 pt-1 text-speakit-muted">
                {testResult.logs.map((l, i) => (
                  <div key={i}>· {l}</div>
                ))}
              </div>
            )}
            {testResult.note && <div className="mt-1 text-speakit-muted">{testResult.note}</div>}
          </div>
        )}
      </Section>

      {/* Servers */}
      <Section title={`Servers (${servers?.installed.length ?? 0})`} hint="Where this bot lives. Add it to your own servers here — other servers add it with your share code.">
        {(servers?.installed ?? []).map((s) => (
          <div key={s.id} className="mb-1.5 flex items-center gap-2 rounded-md bg-black/30 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{s.name}</span>
            <button onClick={() => void removeBotFromServer(s.id, s.name)} className="shrink-0 text-[11px] text-speakit-muted hover:text-red-400">Remove</button>
          </div>
        ))}
        {(servers?.available.filter((s) => !s.installed) ?? []).map((s) => (
          <div key={s.id} className="mb-1.5 flex items-center gap-2 rounded-md bg-black/30 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-speakit-muted">{s.name}</span>
            <button onClick={() => void addBotToServer(s.id)} className="shrink-0 rounded bg-speakit-green/20 px-2 py-0.5 text-[11px] font-bold text-speakit-green hover:bg-speakit-green/30">Add</button>
          </div>
        ))}
        {servers && servers.installed.length === 0 && servers.available.filter((s) => !s.installed).length === 0 && (
          <div className="text-xs text-speakit-muted">Join a server first, then add the bot to it here.</div>
        )}
      </Section>

      {/* Token */}
      <Section title="API token" hint="For scripts outside SpeakIt (bots, dashboards). Sent as Authorization: Bot <token>.">
        <div className="flex items-center gap-2 rounded-md bg-black/40 px-3 py-2">
          <KeyRound size={14} className="shrink-0 text-speakit-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-speakit-muted">••••••{detail.tokenHint.replace("…", "")}</span>
          <button onClick={() => void regenToken()} className="flex shrink-0 items-center gap-1 rounded bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/20">
            <RefreshCw size={12} /> Regenerate
          </button>
        </div>
      </Section>

      {/* Memory + health */}
      <Section title="Memory & health" hint="store.* persists between messages. Health shows the last live run.">
        <div className="mb-2 text-xs text-speakit-muted">
          Last run: {detail.lastRunAt ? new Date(detail.lastRunAt).toLocaleString() : "never"}
          {detail.lastError && <span className="mt-1 block text-red-400">Last error: {detail.lastError}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-speakit-muted">
            {detail.storeKeys.length === 0 ? "No stored keys." : `Keys: ${detail.storeKeys.join(", ")}`}
          </span>
          <button onClick={() => void resetMemory()} disabled={detail.storeKeys.length === 0} className="shrink-0 rounded bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/20 disabled:opacity-40">
            Erase memory
          </button>
        </div>
      </Section>

      {msg && <div className={`mb-3 text-sm ${msgOk ? "text-green-400" : "text-red-400"}`}>{msg}</div>}
      <div className="flex gap-2">
        <PrimaryButton onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save changes" : "Everything saved"}
        </PrimaryButton>
        <button onClick={() => void deleteBot()} title="Delete this bot forever" className="flex items-center gap-1 rounded-md bg-red-500/20 px-3 text-sm text-red-400 hover:bg-red-500/30">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-0.5 text-xs font-bold uppercase tracking-wide text-speakit-muted">{title}</div>
      <p className="mb-2 text-[11px] text-speakit-muted">{hint}</p>
      {children}
    </div>
  );
}
