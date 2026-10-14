"use client";

import { useState } from "react";
import { Hash, Volume2, Plus, Settings, Mic, MicOff, Headphones, PhoneOff, Users, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceActions } from "@/hooks/useVoice";
import { useAppStore, type ChannelItem } from "@/store/useAppStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import { Avatar } from "./Avatar";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";

export function ChannelSidebar({
  onCreateChannel,
  onInvite,
  onOpenSettings,
  onOpenServerSettings,
}: {
  onCreateChannel: (type: "TEXT" | "VOICE", categoryId?: string | null) => void;
  onInvite: () => void;
  onOpenSettings: () => void;
  onOpenServerSettings: () => void;
}) {
  const { serverDetail, activeChannelId, setActiveChannel, showMembers, setShowMembers } = useAppStore();
  const voice = useVoiceStore();
  const { user } = useAuthStore();
  const { openProfile } = useProfileStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!serverDetail) return <div className="w-60 bg-speakit-sidebar" />;

  const canManage = serverDetail.ownerId === user?.id;
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

  const renderChannel = (ch: ChannelItem) => (
    <button
      key={ch.id}
      onClick={() => setActiveChannel(ch.id)}
      className={cn(
        "group mb-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm",
        activeChannelId === ch.id ? "bg-white/10 text-white" : "text-speakit-muted hover:bg-white/5 hover:text-speakit-text"
      )}
    >
      {ch.type === "VOICE" ? <Volume2 size={16} className="shrink-0 opacity-60" /> : <Hash size={16} className="shrink-0 opacity-60" />}
      <span className="flex-1 truncate">{ch.name}</span>
      {ch.type === "VOICE" && voice.channelId === ch.id && <span className="h-2 w-2 shrink-0 rounded-full bg-speakit-green" />}
      {ch.name !== "general" && canManage && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); void deleteChannel(ch.id); }}
          className="hidden text-xs text-speakit-muted hover:text-red-400 group-hover:block"
          title={confirmDelete === ch.id ? "Click again to confirm" : "Delete channel"}
        >
          {confirmDelete === ch.id ? "sure?" : "✕"}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex w-60 flex-col bg-speakit-sidebar">
      <button
        onClick={canManage ? onOpenServerSettings : onInvite}
        title={canManage ? "Server settings" : "Invite friends"}
        className="flex h-12 items-center gap-2 border-b border-black/30 px-3 text-left shadow-sm hover:bg-white/5"
      >
        {serverDetail.iconUrl ? (
          <img src={serverDetail.iconUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white" style={{ backgroundColor: serverDetail.iconColor }}>
            {serverDetail.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="flex-1 truncate text-sm font-bold text-white">{serverDetail.name}</span>
        <ChevronDown size={16} className="shrink-0 text-speakit-muted" />
      </button>
      <div className="flex items-center gap-1 px-4 pt-1">
        <button title="Toggle members" onClick={() => setShowMembers(!showMembers)} className="rounded p-1 text-speakit-muted hover:text-white">
          <Users size={14} />
        </button>
        <button title="Invite" onClick={onInvite} className="rounded p-1 text-speakit-muted hover:text-white">
          <Plus size={16} />
        </button>
        <span className="ml-auto text-[10px] text-speakit-muted">{canManage ? "Click name for settings" : ""}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {serverDetail.categories.map((cat) => {
          const inCat = textChannels.filter((c) => c.categoryId === cat.id);
          const inCatVoice = voiceChannels.filter((c) => c.categoryId === cat.id);
          if (inCat.length === 0 && inCatVoice.length === 0) return null;
          return (
            <div key={cat.id} className="mb-2">
              <div className="mb-1 flex items-center justify-between px-2">
                <span className="text-[11px] font-bold uppercase text-speakit-muted">{cat.name}</span>
                {canManage && <button onClick={() => onCreateChannel("TEXT", cat.id)} className="text-speakit-muted hover:text-white" title={`New channel in ${cat.name}`}><Plus size={14} /></button>}
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
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[11px] font-bold uppercase text-speakit-muted">
              {serverDetail.categories.length > 0 ? "No category" : "Text Channels"}
            </span>
            {canManage && <button onClick={() => onCreateChannel("TEXT", null)} className="text-speakit-muted hover:text-white"><Plus size={14} /></button>}
          </div>
        )}
        {uncategorized.map(renderChannel)}

        <div className="mb-1 mt-4 flex items-center justify-between px-2">
          <span className="text-[11px] font-bold uppercase text-speakit-muted">Voice Channels</span>
          {canManage && <button onClick={() => onCreateChannel("VOICE", null)} className="text-speakit-muted hover:text-white"><Plus size={14} /></button>}
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

      <div className="flex items-center gap-2 bg-[#232428] px-2 py-2">
        {user && (
          <button onClick={() => openProfile(user.id)} title="View profile">
            <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={32} status={user.status} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white">{user?.displayName}</div>
          <div className="truncate text-[11px] text-speakit-muted">@{user?.username}</div>
        </div>
        <button
          title={voice.selfMuted ? "Unmute" : "Mute"}
          onClick={() => useVoiceStore.getState().setSelfMuted(!voice.selfMuted)}
          className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white"
        >
          {voice.selfMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          title={voice.selfDeafened ? "Undeafen" : "Deafen"}
          onClick={() => useVoiceStore.getState().setSelfDeafened(!voice.selfDeafened)}
          className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white"
        >
          <Headphones size={16} />
        </button>
        <button title="Settings" onClick={onOpenSettings} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white">
          <Settings size={16} />
        </button>
      </div>

      {voice.channelId && (
        <div className="border-t border-black/30 bg-[#232428] px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-speakit-green">Voice Connected</span>
            <button
              onClick={() => voiceActions.leave()}
              className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30"
            >
              <PhoneOff size={12} /> Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
