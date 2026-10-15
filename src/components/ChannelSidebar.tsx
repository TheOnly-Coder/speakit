"use client";

import { useState } from "react";
import { Hash, Volume2, Plus, MicOff, PhoneOff, Users, Cog, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceActions } from "@/hooks/useVoice";
import { useAppStore, type ChannelItem } from "@/store/useAppStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import { Avatar } from "./Avatar";
import { ServerMenu } from "./ServerMenu";
import { UserArea } from "./UserArea";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";
import { myServerPerms } from "@/lib/clientPerms";
import { ctxProps } from "./ContextMenu";

export function ChannelSidebar({
  onCreateChannel,
  onInvite,
  onOpenSettings,
  onOpenServerSettings,
  onOpenChannelSettings,
}: {
  onCreateChannel: (type: "TEXT" | "VOICE", categoryId?: string | null) => void;
  onInvite: () => void;
  onOpenSettings: () => void;
  onOpenServerSettings: () => void;
  onOpenChannelSettings: (channelId: string) => void;
}) {
  const { serverDetail, activeChannelId, setActiveChannel, showMembers, setShowMembers, mutedChannels, mentionCounts, toggleMute, markMentionsRead } = useAppStore();
  const voice = useVoiceStore();
  const { user } = useAuthStore();
  const { openProfile } = useProfileStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!serverDetail) return <div className="w-[var(--speakit-sidebar-w)] max-w-[calc(92vw-var(--speakit-rail-w))] bg-speakit-sidebar" />;

  const myPerms = myServerPerms(serverDetail, user?.id);
  const canManage = myPerms.has("manageChannels");
  const textChannels = serverDetail.channels.filter((c) => c.type === "TEXT");
  const voiceChannels = serverDetail.channels.filter((c) => c.type === "VOICE");
  const uncategorized = textChannels.filter((c) => !c.categoryId);

  const deleteChannel = async (id: string) => {
    if (!confirm(id)) return;
    const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Cannot delete channel");
    }
    setConfirmDelete(null);
    await useAppStore.getState().refreshServerDetail(serverDetail.id);
  };

  const confirm = (id: string) => {
    if (confirmDelete === id) return true;
    setConfirmDelete(id);
    setTimeout(() => setConfirmDelete((v) => (v === id ? null : v)), 3000);
    return false;
  };

  const channelMenu = (ch: ChannelItem) => {
    const muted = mutedChannels.includes(ch.id);
    return [
      { type: "header" as const, label: `# ${ch.name}` },
      { type: "item" as const, label: muted ? "Unmute Channel" : "Mute Channel", hint: "M", onClick: () => void toggleMute("channel", ch.id) },
      { type: "item" as const, label: "Copy Channel ID", onClick: () => void navigator.clipboard?.writeText(ch.id).catch(() => {}) },
      ...(canManage
        ? [
            { type: "sep" as const },
            { type: "item" as const, label: "Edit Channel", onClick: () => onOpenChannelSettings(ch.id) },
            ...(ch.name !== "general"
              ? [{ type: "item" as const, label: "Delete Channel", danger: true, onClick: () => void deleteChannel(ch.id) }]
              : []),
          ]
        : []),
    ];
  };

  const renderChannel = (ch: ChannelItem) => {
    const muted = mutedChannels.includes(ch.id);
    const pings = mentionCounts[ch.id] ?? 0;
    const active = activeChannelId === ch.id;
    return (
      <button
        key={ch.id}
        onClick={() => {
          setActiveChannel(ch.id);
          if (pings > 0) void markMentionsRead({ channelId: ch.id });
        }}
        {...ctxProps(() => channelMenu(ch))}
        className={cn(
          "group mb-0.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-[7px] text-left text-[14px] transition-all duration-150",
          active
            ? "bg-gradient-to-r from-speakit-blurple/25 to-speakit-accent/10 text-white shadow-card ring-1 ring-white/10"
            : "text-speakit-muted hover:bg-white/[0.06] hover:text-speakit-text active:bg-white/[0.09]"
        )}
      >
        <span className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
          active ? "bg-speakit-blurple/30 text-white" : "bg-white/[0.04] text-speakit-muted group-hover:text-speakit-text"
        )}>
          {ch.type === "VOICE" ? <Volume2 size={13} className="opacity-90" /> : <Hash size={13} className="opacity-90" />}
        </span>
        <span className={cn("flex-1 truncate", active ? "font-semibold" : "font-medium")}>{ch.name}</span>
        {pings > 0 && <span className="rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow">@{pings}</span>}
        {muted && <BellOff size={12} className="shrink-0 opacity-60" />}
        {ch.type === "VOICE" && voice.channelId === ch.id && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgb(52_211_153/0.6)]" />}
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <span
            role="button"
            tabIndex={0}
            title={muted ? "Unmute channel" : "Mute channel"}
            onClick={(e) => { e.stopPropagation(); void toggleMute("channel", ch.id); }}
            className="rounded p-0.5 text-speakit-muted hover:text-white"
          >
            {muted ? <BellOff size={13} /> : <Bell size={13} />}
          </span>
          {canManage && (
            <span
              role="button"
              tabIndex={0}
              title="Channel settings"
              onClick={(e) => { e.stopPropagation(); onOpenChannelSettings(ch.id); }}
              className="rounded p-0.5 text-speakit-muted hover:text-white"
            >
              <Cog size={13} />
            </span>
          )}
          {ch.name !== "general" && canManage && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); void deleteChannel(ch.id); }}
              className="rounded p-0.5 text-xs text-speakit-muted hover:text-red-400"
              title={confirmDelete === ch.id ? "Click again to confirm" : "Delete channel"}
            >
              {confirmDelete === ch.id ? "sure?" : "✕"}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="flex w-[var(--speakit-sidebar-w)] max-w-[calc(92vw-var(--speakit-rail-w))] shrink-0 flex-col border-r border-white/[0.06] bg-speakit-sidebar/95 backdrop-blur">
      <ServerMenu
        onInvite={onInvite}
        onOpenServerSettings={onOpenServerSettings}
        onCreateChannel={(t) => onCreateChannel(t)}
        onLeave={() => {
          // Handled by the page-level leave flow via a custom event so the
          // sidebar stays dumb; fall back to confirm + DELETE here.
          window.dispatchEvent(new CustomEvent("speakit:leave-server"));
        }}
      />
      <div className="flex items-center gap-1 px-4 pt-1.5">
        <button title="Toggle members" onClick={() => setShowMembers(!showMembers)} className="rounded-lg p-1.5 text-speakit-muted transition hover:bg-white/10 hover:text-white">
          <Users size={14} />
        </button>
        <button title="Invite" onClick={onInvite} className="rounded-lg p-1.5 text-speakit-muted transition hover:bg-white/10 hover:text-white">
          <Plus size={16} />
        </button>
        <span className="ml-auto text-[10px] font-medium text-speakit-muted/70">Right-click for more</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {serverDetail.categories.map((cat) => {
          const inCat = textChannels.filter((c) => c.categoryId === cat.id);
          const inCatVoice = voiceChannels.filter((c) => c.categoryId === cat.id);
          if (inCat.length === 0 && inCatVoice.length === 0) return null;
          return (
            <div key={cat.id} className="mb-3">
              <div className="mb-1.5 flex items-center justify-between px-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-speakit-muted/80">{cat.name}</span>
                {canManage && <button onClick={() => onCreateChannel("TEXT", cat.id)} className="rounded-md p-0.5 text-speakit-muted transition hover:bg-white/10 hover:text-white" title={`New channel in ${cat.name}`}><Plus size={14} /></button>}
              </div>
              {inCat.map(renderChannel)}
              {inCatVoice.map((ch) => (
                <div key={ch.id}>
                  {renderChannel(ch)}
                  {voice.channelId === ch.id && voice.peers.length > 0 && (
                    <div className="ml-6 mt-1 space-y-1">
                      {voice.peers.map((p) => (
                        <button key={p.userId} onClick={() => openProfile(p.userId)} className="flex w-full items-center gap-2 text-xs text-speakit-muted hover:text-white">
                          <Avatar name={p.displayName} color={p.avatarColor} src={p.avatarUrl || undefined} size={18} />
                          <span className="truncate">{p.displayName}</span>
                          {p.muted && <MicOff size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {(uncategorized.length > 0 || (canManage && serverDetail.categories.length === 0)) && (
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-speakit-muted/80">
              {serverDetail.categories.length > 0 ? "No category" : "Text Channels"}
            </span>
            {canManage && <button onClick={() => onCreateChannel("TEXT", null)} className="rounded-md p-0.5 text-speakit-muted transition hover:bg-white/10 hover:text-white"><Plus size={14} /></button>}
          </div>
        )}
        {uncategorized.map(renderChannel)}

        <div className="mb-1.5 mt-4 flex items-center justify-between px-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-speakit-muted/80">Voice Channels</span>
          {canManage && <button onClick={() => onCreateChannel("VOICE", null)} className="rounded-md p-0.5 text-speakit-muted transition hover:bg-white/10 hover:text-white"><Plus size={14} /></button>}
        </div>
        {voiceChannels.filter((c) => !c.categoryId).map((ch) => (
          <div key={ch.id}>
            {renderChannel(ch)}
            {voice.channelId === ch.id && voice.peers.length > 0 && (
                <div className="ml-6 mt-1 space-y-1">
                  {voice.peers.map((p) => (
                    <button key={p.userId} onClick={() => openProfile(p.userId)} className="flex w-full items-center gap-2 text-xs text-speakit-muted hover:text-white">
                      <Avatar name={p.displayName} color={p.avatarColor} src={p.avatarUrl || undefined} size={18} />
                    <span className="truncate">{p.displayName}</span>
                    {p.muted && <MicOff size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <UserArea
        onOpenSettings={onOpenSettings}
        onLogout={() => window.dispatchEvent(new CustomEvent("speakit:logout"))}
      />

      {voice.channelId && (
        <div className="border-t border-white/[0.06] bg-black/30 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Voice Connected
            </span>
            <button
              onClick={() => voiceActions.leave()}
              className="flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/25 transition hover:bg-rose-500 hover:text-white"
            >
              <PhoneOff size={12} /> Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
