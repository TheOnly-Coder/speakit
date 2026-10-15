"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Shield, Crown, Bot as BotIcon, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal, Field, inputCls, PrimaryButton } from "./ui";
import { Avatar, BotTag, ServerIcon } from "./Avatar";
import { useAppStore, type RoleItem } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { myServerPerms } from "@/lib/clientPerms";
import { getSocket } from "@/lib/socket";
import { displayColorFor } from "@/lib/memberGroups";
import { PERMISSION_CATEGORIES, PERMISSION_DESCRIPTIONS, PERMISSION_LABELS, type Permission } from "@/lib/permissions";

const ALL_TABS = [
  { id: "Overview", perm: "manageServer" },
  { id: "Channels", perm: "manageChannels" },
  { id: "Roles", perm: "manageRoles" },
  { id: "Emoji", perm: "manageEmoji" },
  { id: "Bots", perm: "manageServer" },
  { id: "Members", perm: null }, // visible with any moderation perm; buttons gated individually
  { id: "Invite", perm: "manageServer" },
] as const;

function broadcast(serverId: string) {
  try {
    getSocket().emit("server:refresh", { serverId });
  } catch {
    /* ignore */
  }
}

export function ServerSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { serverDetail, activeServerId, refreshServerDetail } = useAppStore();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<string>("Overview");

  const myPerms = serverDetail ? myServerPerms(serverDetail, user?.id) : new Set<string>();
  const canSee = (perm: string | null) => {
    if (!perm) {
      return (
        serverDetail?.ownerId === user?.id ||
        ["manageRoles", "kickMembers", "banMembers", "timeoutMembers"].some((p) => myPerms.has(p))
      );
    }
    return myPerms.has(perm);
  };
  const tabs = ALL_TABS.filter((t) => canSee(t.perm));

  useEffect(() => {
    if (open) {
      const first = ALL_TABS.find((t) =>
        t.perm === null
          ? serverDetail?.ownerId === user?.id ||
            ["manageRoles", "kickMembers", "banMembers", "timeoutMembers"].some((p) => myPerms.has(p))
          : myPerms.has(t.perm)
      );
      setTab(first?.id ?? "Overview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const refresh = async () => {
    if (activeServerId) {
      await refreshServerDetail(activeServerId);
      await useAppStore.getState().refreshMyEmojis();
      broadcast(activeServerId);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Server settings — ${serverDetail?.name ?? ""}`}>
      {!serverDetail && <div className="text-sm text-speakit-muted">Loading…</div>}
      {serverDetail && (
        <>
          {tabs.length === 0 && (
            <div className="py-6 text-center text-sm text-speakit-muted">You don&apos;t have settings permissions here.</div>
          )}
          <div className="mb-4 flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded px-2.5 py-1.5 text-xs font-semibold",
                  tab === t.id ? "bg-speakit-blurple text-white" : "text-speakit-muted hover:bg-white/5"
                )}
              >
                {t.id}
              </button>
            ))}
          </div>
          {tab === "Overview" && <OverviewTab refresh={refresh} />}
          {tab === "Channels" && <ChannelsTab refresh={refresh} />}
          {tab === "Roles" && <RolesTab refresh={refresh} />}
          {tab === "Emoji" && <EmojiTab refresh={refresh} />}
          {tab === "Bots" && <ServerBotsTab refresh={refresh} />}
          {tab === "Members" && <MembersTab refresh={refresh} />}
          {tab === "Invite" && <InviteTab refresh={refresh} />}
        </>
      )}
    </Modal>
  );
}

function OverviewTab({ refresh }: { refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const [name, setName] = useState(serverDetail?.name ?? "");
  const [description, setDescription] = useState(serverDetail?.description ?? "");
  const [tags, setTags] = useState(serverDetail?.tags ?? "");
  const [discoverable, setDiscoverable] = useState(serverDetail?.discoverable ?? false);
  const [allowExternal, setAllowExternal] = useState(serverDetail?.allowExternalEmoji ?? true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    setName(serverDetail?.name ?? "");
    setDescription(serverDetail?.description ?? "");
    setTags(serverDetail?.tags ?? "");
    setDiscoverable(serverDetail?.discoverable ?? false);
    setAllowExternal(serverDetail?.allowExternalEmoji ?? true);
  }, [serverDetail]);

  const save = async (patch: Record<string, unknown>) => {
    if (!serverDetail) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/servers/${serverDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Failed to save");
        return;
      }
      await refresh();
      setMsg("Saved ✓");
    } finally {
      setBusy(false);
    }
  };

  const uploadIcon = async (file: File | undefined) => {
    if (!file || !serverDetail) return;
    if (!file.type.startsWith("image/")) {
      setMsg("Icon must be an image");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg("Icon must be under 8 MB");
      return;
    }
    setUploading(true);
    try {
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `server-icons/${serverDetail.id}-${Date.now()}.${ext}`;
      // Reuse the avatars bucket for server icons (covered by the same policies).
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setMsg(`Upload failed: ${error.message} (run scripts/supabase-storage.sql in Supabase first)`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await save({ iconUrl: data.publicUrl });
    } finally {
      setUploading(false);
    }
  };

  const uploadBanner = async (file: File | undefined) => {
    if (!file || !serverDetail) return;
    if (!file.type.startsWith("image/")) {
      setMsg("Banner must be an image");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg("Banner must be under 8 MB");
      return;
    }
    setUploadingBanner(true);
    try {
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `server-banners/${serverDetail.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setMsg(`Upload failed: ${error.message} (run scripts/supabase-storage.sql in Supabase first)`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await save({ bannerUrl: data.publicUrl });
    } finally {
      setUploadingBanner(false);
    }
  };

  if (!serverDetail) return null;
  return (
    <div>
      {serverDetail.bannerUrl && (
        <div className="mb-3 overflow-hidden rounded-lg">
          <img src={serverDetail.bannerUrl} alt="banner" className="h-24 w-full object-cover" />
        </div>
      )}
      <div className="mb-4 flex items-center gap-4">
        {serverDetail.iconUrl ? (
          <img src={serverDetail.iconUrl} alt="icon" className="h-16 w-16 rounded-2xl object-cover" />
        ) : (
          <ServerIcon name={serverDetail.name} color={serverDetail.iconColor} />
        )}
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">
            {uploading ? "Uploading…" : "Upload icon"}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => void uploadIcon(e.target.files?.[0])} />
          </label>
          <label className="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">
            {uploadingBanner ? "Uploading…" : "Upload banner"}
            <input type="file" accept="image/*" className="hidden" disabled={uploadingBanner} onChange={(e) => void uploadBanner(e.target.files?.[0])} />
          </label>
          {serverDetail.iconUrl && (
            <button onClick={() => void save({ iconUrl: "" })} className="text-xs text-speakit-muted hover:text-red-400">Remove icon</button>
          )}
          {serverDetail.bannerUrl && (
            <button onClick={() => void save({ bannerUrl: "" })} className="text-xs text-speakit-muted hover:text-red-400">Remove banner</button>
          )}
        </div>
      </div>
      <Field label="Server name">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={64} />
          <button onClick={() => void save({ name })} disabled={busy} className="rounded-md bg-speakit-blurple px-3 text-sm text-white disabled:opacity-50">Save</button>
        </div>
      </Field>
      <Field label="Description (shown in discovery)">
        <div className="flex gap-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this server about?" className={inputCls} maxLength={256} />
          <button onClick={() => void save({ description })} disabled={busy} className="rounded-md bg-speakit-blurple px-3 text-sm text-white disabled:opacity-50">Save</button>
        </div>
      </Field>
      <Field label="Tags (comma separated, e.g. gaming, chill, 18+)">
        <div className="flex gap-2">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gaming, chill" className={inputCls} maxLength={256} />
          <button onClick={() => void save({ tags })} disabled={busy} className="rounded-md bg-speakit-blurple px-3 text-sm text-white disabled:opacity-50">Save</button>
        </div>
      </Field>
      <label className="mb-2 flex cursor-pointer items-center justify-between rounded-md bg-speakit-input px-3 py-2.5 text-sm">
        <span className="text-white">List in server directory <span className="block text-xs font-normal text-speakit-muted">Anyone can find &amp; join</span></span>
        <input type="checkbox" checked={discoverable} onChange={(e) => { setDiscoverable(e.target.checked); void save({ discoverable: e.target.checked }); }} className="h-4 w-4 accent-[#5865f2]" />
      </label>
      <label className="mb-3 flex cursor-pointer items-center justify-between rounded-md bg-speakit-input px-3 py-2.5 text-sm">
        <span className="text-white">Allow other servers&apos; emoji here</span>
        <input type="checkbox" checked={allowExternal} onChange={(e) => { setAllowExternal(e.target.checked); void save({ allowExternalEmoji: e.target.checked }); }} className="h-4 w-4 accent-[#5865f2]" />
      </label>
      {msg && <div className="mb-2 text-sm text-green-400">{msg}</div>}
    </div>
  );
}

function ChannelsTab({ refresh }: { refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const [catName, setCatName] = useState("");
  const [msg, setMsg] = useState("");
  if (!serverDetail) return null;

  const act = async (fn: () => Promise<Response>, errFallback: string) => {
    setMsg("");
    const res = await fn();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(data.error ?? errFallback);
    else await refresh();
  };

  return (
    <div>
      <Field label="New category">
        <div className="flex gap-2">
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Gaming" className={inputCls} maxLength={32} />
          <button
            onClick={() => {
              if (!catName.trim()) return;
              void act(() => fetch(`/api/servers/${serverDetail.id}/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: catName.trim() }) }), "Failed").then(() => setCatName(""));
            }}
            className="rounded-md bg-speakit-blurple px-3 text-sm text-white"
          >
            <Plus size={16} />
          </button>
        </div>
      </Field>
      {msg && <div className="mb-2 text-sm text-red-400">{msg}</div>}
      <div className="max-h-64 space-y-3 overflow-y-auto">
        <CategoryRow key="uncat" categoryId={null} name="No category" channels={serverDetail.channels.filter((c) => !c.categoryId)} refresh={refresh} />
        {serverDetail.categories.map((cat) => (
          <CategoryRow key={cat.id} categoryId={cat.id} name={cat.name} channels={serverDetail.channels.filter((c) => c.categoryId === cat.id)} refresh={refresh} canDelete />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ categoryId, name, channels, refresh, canDelete }: { categoryId: string | null; name: string; channels: { id: string; name: string; type: string; categoryId: string | null }[]; refresh: () => Promise<void>; canDelete?: boolean }) {
  const { serverDetail } = useAppStore();
  const del = async () => {
    if (!serverDetail || !categoryId || !confirm(`Delete category "${name}"? Channels move out, nothing is deleted.`)) return;
    await fetch(`/api/servers/${serverDetail.id}/categories/${categoryId}`, { method: "DELETE" });
    await refresh();
  };
  return (
    <div className="rounded-md bg-speakit-input p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase text-speakit-muted">{name} ({channels.length})</span>
        {canDelete && <button onClick={() => void del()} className="text-speakit-muted hover:text-red-400" title="Delete category"><Trash2 size={13} /></button>}
      </div>
      {channels.map((c) => (
        <div key={c.id} className="flex items-center gap-2 px-1 py-0.5 text-sm text-speakit-text">
          <span className="text-speakit-muted">{c.type === "VOICE" ? "🔊" : "#"}</span>
          <span className="flex-1 truncate">{c.name}</span>
          {serverDetail && <MoveSelect serverId={serverDetail.id} channelId={c.id} current={c.categoryId ?? null} categories={serverDetail.categories} refresh={refresh} />}
        </div>
      ))}
      {channels.length === 0 && <div className="px-1 text-xs text-speakit-muted">Empty</div>}
    </div>
  );
}

function MoveSelect({ serverId, channelId, current, categories, refresh }: { serverId: string; channelId: string; current: string | null; categories: { id: string; name: string }[]; refresh: () => Promise<void> }) {
  void serverId;
  return (
    <select
      value={current ?? ""}
      onChange={async (e) => {
        await fetch(`/api/channels/${channelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: e.target.value === "" ? null : e.target.value }),
        });
        await refresh();
      }}
      className="max-w-[110px] rounded bg-black/30 px-1 py-0.5 text-[11px] text-speakit-muted outline-none"
      title="Move to category"
    >
      <option value="">No cat.</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

function RolesTab({ refresh }: { refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  if (!serverDetail) return null;
  const selected = serverDetail.roles.find((r) => r.id === selectedId) ?? null;

  const create = async () => {
    if (!name.trim()) return;
    const res = await fetch(`/api/servers/${serverDetail.id}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setName("");
    setSelectedId(data.role.id);
    await refresh();
  };

  return (
    <div>
      <div className="mb-2 rounded-md bg-white/[0.04] px-2.5 py-2 text-[11px] leading-relaxed text-speakit-muted">
        <span className="font-bold text-white">Offline</span> is automatic — invisible or offline members appear there (dimmed) but keep their roles. It can&apos;t be edited or assigned.
      </div>
      <div className="flex gap-3">
      <div className="w-40 shrink-0">
        <div className="mb-1 flex gap-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New role" className={inputCls} maxLength={32} />
          <button onClick={() => void create()} className="rounded-md bg-speakit-blurple px-2 text-white"><Plus size={14} /></button>
        </div>
        {msg && <div className="mb-1 text-xs text-red-400">{msg}</div>}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {serverDetail.roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${selectedId === r.id ? "bg-white/10 text-white" : "text-speakit-muted hover:bg-white/5"}`}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-[10px]">{r.memberCount}</span>
            </button>
          ))}
          {serverDetail.roles.length === 0 && <div className="text-xs text-speakit-muted">No roles yet — create one.</div>}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {!selected && <div className="text-sm text-speakit-muted">Select a role to edit its permissions.</div>}
        {selected && <RoleEditor key={selected.id} role={selected} refresh={refresh} />}
      </div>
      </div>
    </div>
  );
}

function RoleEditor({ role, refresh }: { role: RoleItem; refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const { user: me } = useAuthStore();
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [perms, setPerms] = useState<string[]>(role.permissions);
  const [msg, setMsg] = useState("");
  if (!serverDetail) return null;

  const save = async () => {
    const res = await fetch(`/api/servers/${serverDetail.id}/roles/${role.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, permissions: perms }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setMsg("Saved ✓");
    await refresh();
  };
  const remove = async () => {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    await fetch(`/api/servers/${serverDetail.id}/roles/${role.id}`, { method: "DELETE" });
    await refresh();
  };
  const toggle = (p: string) => setPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const [assignMsg, setAssignMsg] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const holders = (serverDetail.members ?? []).filter((m) => m.roleIds.includes(role.id));
  const nonHolders = (serverDetail.members ?? []).filter(
    (m) => !m.roleIds.includes(role.id) && (m.role !== "owner" || m.id === me?.id)
  );

  const setRole = async (targetUserId: string, action: "add" | "remove") => {
    setAssignMsg("");
    const res = await fetch(`/api/servers/${serverDetail.id}/members/${targetUserId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId: role.id, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAssignMsg(data.error ?? "Couldn't change roles");
      return;
    }
    await refresh();
  };

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded bg-transparent" title="Role color" />
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={32} />
      </div>
      <div className="mb-2 space-y-3">
        {PERMISSION_CATEGORIES.map((cat) => (
          <div key={cat.title}>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-speakit-muted">{cat.title}</span>
              <button
                onClick={() => {
                  // "Clear permissions" per section — mirrors the screenshot link.
                  setPerms((prev) => prev.filter((p) => !(cat.perms as string[]).includes(p)));
                }}
                className="text-[11px] text-speakit-muted hover:text-white"
                title={`Clear ${cat.title}`}
              >
                Clear permissions
              </button>
            </div>
            <div className="space-y-1">
              {cat.perms.map((p) => (
                <label key={p} className="flex cursor-pointer items-center justify-between gap-3 rounded bg-speakit-input px-3 py-2 text-sm">
                  <span>
                    <span className="block font-semibold text-white">{PERMISSION_LABELS[p as Permission]}</span>
                    <span className="block text-[11px] font-normal text-speakit-muted">{PERMISSION_DESCRIPTIONS[p as Permission]}</span>
                  </span>
                  <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} className="h-4 w-4 shrink-0 accent-[#5865f2]" />
                </label>
              ))}
            </div>
          </div>
        ))}
        {perms.includes("managePins") && (
          <div>
            <div className="mb-1 px-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-speakit-muted">Legacy</div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded bg-speakit-input px-3 py-2 text-sm">
              <span>
                <span className="block font-semibold text-white">{PERMISSION_LABELS.managePins}</span>
                <span className="block text-[11px] font-normal text-speakit-muted">{PERMISSION_DESCRIPTIONS.managePins}</span>
              </span>
              <input type="checkbox" checked={perms.includes("managePins")} onChange={() => toggle("managePins")} className="h-4 w-4 shrink-0 accent-[#5865f2]" />
            </label>
          </div>
        )}
      </div>
      {msg && <div className="mb-2 text-xs text-green-400">{msg}</div>}
      <div className="flex gap-2">
        <PrimaryButton onClick={() => void save()}>Save role</PrimaryButton>
        <button onClick={() => void remove()} className="rounded-md bg-red-500/20 px-3 text-sm text-red-400 hover:bg-red-500/30">Delete</button>
      </div>
      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="mb-1 text-xs font-bold uppercase text-speakit-muted">Members with this role ({holders.length})</div>
        {holders.length === 0 && <div className="mb-1 text-xs text-speakit-muted">Nobody yet — give it to someone below.</div>}
        <div className="mb-2 max-h-24 space-y-1 overflow-y-auto">
          {holders.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded bg-speakit-input px-2 py-1 text-xs text-white">
              <Avatar name={m.displayName} color={m.avatarColor} src={m.avatarUrl || undefined} size={20} />
              <span className="flex-1 truncate">{m.displayName} <span className="text-speakit-muted">@{m.username}</span></span>
              <button onClick={() => void setRole(m.id, "remove")} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] hover:bg-white/20">Remove</button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className={`${inputCls} text-sm`}>
            <option value="">Give to a member…</option>
            {nonHolders.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName} (@{m.username})</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!assignTo) return;
              void setRole(assignTo, "add").then(() => setAssignTo(""));
            }}
            disabled={!assignTo}
            className="shrink-0 rounded-md bg-speakit-green px-3 text-sm text-white disabled:opacity-40"
          >
            Give role
          </button>
        </div>
        {assignMsg && <div className="mt-1 text-xs text-red-400">{assignMsg}</div>}
      </div>
    </div>
  );
}

function EmojiTab({ refresh }: { refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const { user } = useAuthStore();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  if (!serverDetail) return null;

  const upload = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setMsg("Emoji must be an image or GIF");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg("Emoji must be under 8 MB");
      return;
    }
    const cleanName = name.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,32}$/.test(cleanName)) {
      setMsg("Name it first: lowercase letters, numbers, _ (e.g. party_parrot)");
      return;
    }
    setUploading(true);
    setMsg("");
    try {
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${serverDetail.id}/${cleanName}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("emojis").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setMsg(`Upload failed: ${upErr.message} (run scripts/supabase-storage.sql first)`);
        return;
      }
      const { data } = supabase.storage.from("emojis").getPublicUrl(path);
      const res = await fetch(`/api/servers/${serverDetail.id}/emojis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, url: data.publicUrl }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(out.error ?? "Failed to add emoji");
        return;
      }
      setName("");
      setMsg(`:${cleanName}: added ✓ — type :${cleanName}: in chat to use it`);
      await refresh();
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string, emojiName: string) => {
    if (!confirm(`Delete :${emojiName}:?`)) return;
    await fetch(`/api/servers/${serverDetail.id}/emojis/${id}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div>
      <Field label="New emoji name (then pick the image)">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="party_parrot" className={inputCls} maxLength={32} />
          <label className="cursor-pointer rounded-md bg-speakit-blurple px-3 py-2 text-sm text-white">
            {uploading ? "…" : "Upload"}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        </div>
      </Field>
      {msg && <div className="mb-2 text-sm text-green-400">{msg}</div>}
      <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
        {serverDetail.customEmojis.map((e) => (
          <div key={e.id} className="group relative flex flex-col items-center rounded-md bg-speakit-input p-2">
            <img src={e.url} alt={e.name} className="h-10 w-10 object-contain" loading="lazy" />
            <span className="mt-1 max-w-full truncate text-[10px] text-speakit-muted">:{e.name}:</span>
            <button onClick={() => void remove(e.id, e.name)} className="absolute right-1 top-1 hidden rounded bg-black/60 p-0.5 text-red-400 group-hover:block" title="Delete">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {serverDetail.customEmojis.length === 0 && <div className="col-span-4 py-3 text-center text-xs text-speakit-muted">No custom emoji yet.</div>}
      </div>
    </div>
  );
}

type InstalledBot = {
  id: string;
  userId: string;
  name: string;
  username: string;
  avatarColor: string;
  avatarUrl: string;
  enabled: boolean;
  commands: { name: string; description: string }[];
  addedById: string;
  installedAt: string;
};

/**
 * Server Settings → Bots: paste any bot's share code to install it here.
 * Installed bots join as members, answer "/" commands from the autocomplete
 * menu, and run their code on every message (when they have no commands,
 * they just do whatever their code says).
 */
function ServerBotsTab({ refresh }: { refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const [bots, setBots] = useState<InstalledBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!serverDetail) return null;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverDetail.id}/bots`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setBots(data.bots ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDetail.id]);

  const add = async () => {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setMsg("Paste a bot's share code first — bot owners find it in User Settings → Bots.");
      setMsgOk(false);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/servers/${serverDetail.id}/bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Couldn't add that bot");
        setMsgOk(false);
        return;
      }
      setCode("");
      setMsg(`"${data.bot?.name ?? "Bot"}" joined the server ✓ — type / in chat to use it.`);
      setMsgOk(true);
      await load();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (bot: InstalledBot) => {
    if (!confirm(`Remove "${bot.name}" from this server? Its code stops running here.`)) return;
    await fetch(`/api/servers/${serverDetail.id}/bots/${bot.id}`, { method: "DELETE" });
    await load();
    await refresh();
  };

  return (
    <div>
      <div className="mb-3 rounded-lg bg-speakit-blurple/10 p-3 text-xs text-speakit-text">
        <span className="font-bold text-white">Bots are members with code.</span> Ask any bot owner for
        their bot&apos;s <b>share code</b>, paste it below, and the bot joins instantly. Type{" "}
        <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-white">/</kbd> in any text
        channel to see what the installed bots can do.
      </div>
      <Field label="Add a bot with its share code">
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. K7Q2MX9P"
            className={`${inputCls} uppercase tracking-[0.2em]`}
            maxLength={32}
          />
          <button
            onClick={() => void add()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-speakit-green px-4 text-sm font-semibold text-white hover:bg-[#1a8a4a] disabled:opacity-50"
          >
            <BotIcon size={15} /> {busy ? "Adding…" : "Add Bot"}
          </button>
        </div>
      </Field>
      {msg && <div className={`mb-3 text-sm ${msgOk ? "text-green-400" : "text-red-400"}`}>{msg}</div>}

      <div className="mb-1 text-xs font-bold uppercase text-speakit-muted">
        Installed bots ({bots.length})
      </div>
      {loading && <div className="py-3 text-center text-xs text-speakit-muted">Loading bots…</div>}
      {!loading && bots.length === 0 && (
        <div className="rounded-md bg-speakit-input p-4 text-center text-xs text-speakit-muted">
          No bots yet. Paste a share code above — bots show up here with their commands.
        </div>
      )}
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {bots.map((b) => (
          <div key={b.id} className="rounded-md bg-speakit-input px-2.5 py-2">
            <div className="flex items-center gap-2">
              <Avatar name={b.name} color={b.avatarColor} src={b.avatarUrl || undefined} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate text-sm font-semibold text-white">
                  <span className="truncate">{b.name}</span>
                  <BotTag />
                </div>
                <div className="truncate text-[11px] text-speakit-muted">
                  @{b.username}
                  {!b.enabled && <span className="ml-1 text-yellow-400">· paused by owner</span>}
                </div>
              </div>
              <button
                onClick={() => void remove(b)}
                className="shrink-0 rounded bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/30"
              >
                Remove
              </button>
            </div>
            {b.commands.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1 pl-10">
                {b.commands.map((c) => (
                  <span key={c.name} title={c.description || `/${c.name}`} className="rounded bg-speakit-blurple/20 px-1.5 py-0.5 text-[11px] font-semibold text-[#b5bdff]">
                    /{c.name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-1 pl-10 text-[11px] text-speakit-muted">
                No exposed commands — it just runs its code on messages.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersTab({ refresh }: { refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const { user } = useAuthStore();
  const [msg, setMsg] = useState("");
  const [showBans, setShowBans] = useState(false);
  if (!serverDetail) return null;
  const myPerms = myServerPerms(serverDetail, user?.id);
  const canKick = myPerms.has("kickMembers");
  const canBan = myPerms.has("banMembers");
  const canRoles = myPerms.has("manageRoles");

  const action = async (memberUserId: string, act: "kick" | "ban" | "unban", reason?: string) => {
    const verb = act === "kick" ? "Kick" : act === "ban" ? "Ban" : "Unban";
    if (!confirm(`${verb} this user?${act === "ban" ? " They won't be able to rejoin." : ""}`)) return;
    setMsg("");
    const res = await new Promise<unknown>((resolve) => {
      getSocket().emit("server:member:action", { serverId: serverDetail.id, memberUserId, action, reason }, (r: unknown) => resolve(r));
    });
    const r = res as { ok?: boolean; error?: string };
    if (!r?.ok) {
      setMsg(r?.error ?? "Failed");
      return;
    }
    await refresh();
  };

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button onClick={() => setShowBans(false)} className={`rounded px-2 py-1 text-xs font-semibold ${!showBans ? "bg-white/10 text-white" : "text-speakit-muted"}`}>Members ({serverDetail.members.length})</button>
        <button onClick={() => setShowBans(true)} className={`rounded px-2 py-1 text-xs font-semibold ${showBans ? "bg-white/10 text-white" : "text-speakit-muted"}`}>Banned ({serverDetail.bans.length})</button>
      </div>
      {msg && <div className="mb-2 text-sm text-red-400">{msg}</div>}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {!showBans && serverDetail.members.map((m) => (
          <div key={m.id} className="rounded-md bg-speakit-input px-2 py-1.5">
            <div className="flex items-center gap-2">
              <Avatar name={m.displayName} color={m.avatarColor} src={m.avatarUrl || undefined} size={28} status={m.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white" style={{ color: displayColorFor(m, serverDetail.roles) ?? undefined }}>{m.displayName} {m.role === "owner" && <Crown size={12} className="inline text-yellow-400" />}</div>
                <div className="truncate text-[11px] text-speakit-muted">@{m.username}</div>
              </div>
              {m.id !== user?.id && m.role !== "owner" && (
                <div className="flex gap-1">
                  {canKick && <button onClick={() => void action(m.id, "kick")} className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">Kick</button>}
                  {canBan && <button onClick={() => { const reason = prompt("Ban reason (optional):") ?? ""; void action(m.id, "ban", reason); }} className="rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/30">Ban</button>}
                </div>
              )}
            </div>
            {m.roleNames.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 pl-9">
                {m.roleNames.map((rn) => (
                  <span key={rn} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white"><Shield size={9} className="mr-0.5 inline" />{rn}</span>
                ))}
              </div>
            )}
            {(m.id === user?.id || m.role !== "owner") && canRoles && serverDetail.roles.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 pl-9">
                {serverDetail.roles.map((r) => {
                  const has = m.roleIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      title={has ? `Remove ${r.name}` : `Give ${r.name}`}
                      onClick={async () => {
                        setMsg("");
                        const res = await fetch(`/api/servers/${serverDetail.id}/members/${m.id}/roles`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ roleId: r.id, action: has ? "remove" : "add" }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setMsg(data.error ?? "Couldn't change roles");
                          return;
                        }
                        await refresh();
                      }}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${has ? "text-white" : "text-speakit-muted hover:text-white"}`}
                      style={has ? { backgroundColor: r.color + "44", border: `1px solid ${r.color}` } : { border: "1px solid transparent" }}
                    >
                      {has ? "✓ " : "+ "}{r.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {showBans && serverDetail.bans.map((b) => (
          <div key={b.id} className="flex items-center gap-2 rounded-md bg-speakit-input px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">{b.displayName}</div>
              <div className="truncate text-[11px] text-speakit-muted">@{b.username}{b.reason ? ` — ${b.reason}` : ""}</div>
            </div>
            <button onClick={() => void action(b.userId, "unban")} disabled={!canBan} className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20 disabled:opacity-40">Unban</button>
          </div>
        ))}
        {showBans && serverDetail.bans.length === 0 && <div className="py-3 text-center text-xs text-speakit-muted">Nobody banned. Keep it that way 🤝</div>}
      </div>
    </div>
  );
}

function InviteTab({ refresh }: { refresh: () => Promise<void> }) {
  const { serverDetail } = useAppStore();
  const [custom, setCustom] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  if (!serverDetail) return null;
  const memberCount = serverDetail.members.length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serverDetail.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };
  const regenerate = async () => {
    if (!confirm("Generate a new code? The old one stops working.")) return;
    const res = await fetch(`/api/servers/${serverDetail.id}/invite`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setMsg("");
    await refresh();
  };
  const setCustomCode = async () => {
    const code = custom.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      setMsg("Use 4–8 characters: A–Z, 0–9");
      return;
    }
    const res = await fetch(`/api/servers/${serverDetail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setCustom("");
    setMsg("Custom code set ✓");
    await refresh();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-md bg-speakit-input px-4 py-3">
        <span className="text-xl font-bold tracking-[0.3em] text-white">{serverDetail.inviteCode}</span>
        <div className="flex gap-2">
          <button onClick={() => void copy()} className="rounded bg-speakit-blurple px-3 py-1.5 text-sm text-white">{copied ? "Copied!" : "Copy"}</button>
          <button onClick={() => void regenerate()} className="rounded bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">Regenerate</button>
        </div>
      </div>
      <Field label={`Custom code (unlocks at 10 members — this server has ${memberCount})`}>
        <div className="flex gap-2">
          <input value={custom} onChange={(e) => setCustom(e.target.value.toUpperCase())} placeholder="e.g. RAIDNITE" className={`${inputCls} uppercase tracking-widest`} maxLength={8} />
          <button onClick={() => void setCustomCode()} className="rounded-md bg-speakit-green px-3 text-sm text-white">Set</button>
        </div>
      </Field>
      {msg && <div className="mb-2 text-sm text-green-400">{msg}</div>}
    </div>
  );
}
