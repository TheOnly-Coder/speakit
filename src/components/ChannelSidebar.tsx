"use client";

import { useState } from "react";
import { Hash, Volume2, Plus, Settings, Mic, MicOff, Headphones, PhoneOff, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceActions } from "@/hooks/useVoice";
import { useAppStore } from "@/store/useAppStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import { Avatar } from "./Avatar";
import { useAuthStore } from "@/store/useAuthStore";

export function ChannelSidebar({
  onCreateChannel,
  onInvite,
  onOpenSettings,
}: {
  onCreateChannel: (type: "TEXT" | "VOICE") => void;
  onInvite: () => void;
  onOpenSettings: () => void;
}) {
  const { serverDetail, activeChannelId, setActiveChannel, showMembers, setShowMembers } = useAppStore();
  const voice = useVoiceStore();
  const { user } = useAuthStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!serverDetail) return <div className="w-60 bg-speakit-sidebar" />;

  const textChannels = serverDetail.channels.filter((c) => c.type === "TEXT");
  const voiceChannels = serverDetail.channels.filter((c) => c.type === "VOICE");

  const deleteChannel = async (id: string) => {
    if (!confirm(id)) return;
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    await useAppStore.getState().refreshServerDetail(serverDetail.id);
  };

  const confirm = (id: string) => {
    if (confirmDelete === id) return true;
    setConfirmDelete(id);
    setTimeout(() => setConfirmDelete((v) => (v === id ? null : v)), 3000);
    return false;
  };

  return (
    <div className="flex w-60 flex-col bg-speakit-sidebar">
      <div className="flex h-12 items-center justify-between border-b border-black/30 px-4 shadow-sm">
        <span className="truncate text-sm font-bold text-white">{serverDetail.name}</span>
        <div className="flex items-center gap-1">
          <button title="Toggle members" onClick={() => setShowMembers(!showMembers)} className="rounded p-1 text-speakit-muted hover:text-white">
            <Users size={16} />
          </button>
          <button title="Invite" onClick={onInvite} className="rounded p-1 text-speakit-muted hover:text-white">
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-[11px] font-bold uppercase text-speakit-muted">Text Channels</span>
          <button onClick={() => onCreateChannel("TEXT")} className="text-speakit-muted hover:text-white"><Plus size={14} /></button>
        </div>
        {textChannels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setActiveChannel(ch.id)}
            className={cn(
              "group mb-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm",
              activeChannelId === ch.id ? "bg-white/10 text-white" : "text-speakit-muted hover:bg-white/5 hover:text-speakit-text"
            )}
          >
            <Hash size={16} className="shrink-0 opacity-60" />
            <span className="flex-1 truncate">{ch.name}</span>
            {ch.name !== "general" && (
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
        ))}

        <div className="mb-1 mt-4 flex items-center justify-between px-2">
          <span className="text-[11px] font-bold uppercase text-speakit-muted">Voice Channels</span>
          <button onClick={() => onCreateChannel("VOICE")} className="text-speakit-muted hover:text-white"><Plus size={14} /></button>
        </div>
        {voiceChannels.map((ch) => {
          const isActiveVoice = voice.channelId === ch.id;
          return (
            <div key={ch.id}>
              <button
                onClick={() => setActiveChannel(ch.id)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm",
                  activeChannelId === ch.id ? "bg-white/10 text-white" : "text-speakit-muted hover:bg-white/5 hover:text-speakit-text"
                )}
              >
                <Volume2 size={16} className="shrink-0 opacity-60" />
                <span className="flex-1 truncate">{ch.name}</span>
                {isActiveVoice && <span className="h-2 w-2 rounded-full bg-speakit-green" />}
              </button>
              {isActiveVoice && voice.peers.length > 0 && (
                <div className="ml-6 mt-1 space-y-1">
                  {voice.peers.map((p) => (
                    <div key={p.userId} className="flex items-center gap-2 text-xs text-speakit-muted">
                      <Avatar name={p.displayName} color={p.avatarColor} size={18} />
                      <span className="truncate">{p.displayName}</span>
                      {p.muted && <MicOff size={12} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 bg-[#232428] px-2 py-2">
        {user && <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={32} status={user.status} />}
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
