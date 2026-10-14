"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hash, Volume2, Users } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { useChatStore, type ChatMessage } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { useAuthStore } from "@/store/useAuthStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import { voiceActions } from "@/hooks/useVoice";
import { Avatar } from "./Avatar";

function toChatMessage(raw: Record<string, unknown>): ChatMessage {
  const author = raw.author as ChatMessage["author"];
  const reactionsRaw = (raw.reactions ?? []) as { emoji: string; userId?: string; user?: { id: string } }[];
  // REST returns reactions as array of Reaction objects; normalize to grouped
  let reactions: ChatMessage["reactions"] = [];
  if (Array.isArray(reactionsRaw) && reactionsRaw.length > 0 && "emoji" in reactionsRaw[0] && !("count" in reactionsRaw[0])) {
    const grouped = new Map<string, { emoji: string; count: number; me: boolean; users: string[] }>();
    // We don't know me here; caller patches. Keep simple.
    for (const r of reactionsRaw as unknown as { emoji: string; user: { username: string; id: string } }[]) {
      const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, me: false, users: [] as string[] };
      g.count += 1;
      g.users.push(r.user?.username ?? "");
      grouped.set(r.emoji, g);
    }
    reactions = [...grouped.values()];
  } else {
    reactions = (raw.reactions ?? []) as ChatMessage["reactions"];
  }
  return {
    id: String(raw.id),
    content: String(raw.content ?? ""),
    channelId: raw.channelId ? String(raw.channelId) : undefined,
    edited: Boolean(raw.edited),
    createdAt: String(raw.createdAt),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    tempId: raw.tempId ? String(raw.tempId) : undefined,
    author,
    replyTo: (raw.replyTo ?? null) as ChatMessage["replyTo"],
    reactions,
    attachments: Array.isArray(raw.attachments)
      ? (raw.attachments as { url: string; name: string; mime: string }[]).map((a) => ({
          url: String(a.url),
          name: String(a.name ?? ""),
          mime: String(a.mime ?? ""),
        }))
      : [],
  };
}

export function ChatView({ channelId }: { channelId: string }) {
  const { serverDetail, showMembers, setShowMembers } = useAppStore();
  const { messages, typing, setMessages, addMessage, updateMessage, removeMessage, setTyping } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channel = serverDetail?.channels.find((c) => c.id === channelId);
  const key = channelId;
  const list = messages[key] ?? [];
  const typingList = typing[key] ?? [];

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }, []);

  // Load history + join room
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReplyTo(null);
    setEditing(null);
    (async () => {
      try {
        const res = await fetch(`/api/channels/${channelId}/messages?limit=100`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setMessages(key, (data.messages ?? []).map((m: Record<string, unknown>) => toChatMessage(m)));
          setTimeout(scrollToBottom, 50);
        }
      } catch { /* ignore */ }
      finally {
        if (!cancelled) setLoading(false);
      }
      const socket = getSocket();
      socket.emit("channel:join", { channelId });
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, key, setMessages, scrollToBottom]);

  // Socket listeners
  useEffect(() => {
    const socket = getSocket();
    const onNew = (msg: Record<string, unknown>) => {
      if (String(msg.channelId) !== channelId) return;
      addMessage(key, toChatMessage({ ...msg, reactions: [] }));
      scrollToBottom();
    };
    const onUpdated = (p: { id: string; channelId: string; content: string; edited: boolean; updatedAt: string }) => {
      if (p.channelId !== channelId) return;
      updateMessage(key, p.id, { content: p.content, edited: p.edited, updatedAt: p.updatedAt });
    };
    const onDeleted = (p: { id: string; channelId: string }) => {
      if (p.channelId !== channelId) return;
      removeMessage(key, p.id);
    };
    const onReactions = (p: { messageId: string; channelId: string; reactions: ChatMessage["reactions"] }) => {
      if (p.channelId !== channelId) return;
      updateMessage(key, p.messageId, { reactions: p.reactions });
    };
    const onTyping = (p: { channelId: string; userId: string; displayName: string; typing: boolean }) => {
      if (p.channelId !== channelId) return;
      const current = useChatStore.getState().typing[key] ?? [];
      if (p.typing) {
        if (!current.some((t) => t.userId === p.userId)) setTyping(key, [...current, { userId: p.userId, displayName: p.displayName }]);
      } else {
        setTyping(key, current.filter((t) => t.userId !== p.userId));
      }
    };
    socket.on("channel:message:new", onNew);
    socket.on("channel:message:updated", onUpdated);
    socket.on("channel:message:deleted", onDeleted);
    socket.on("message:reactions:updated", onReactions);
    socket.on("channel:typing:update", onTyping);
    return () => {
      socket.off("channel:message:new", onNew);
      socket.off("channel:message:updated", onUpdated);
      socket.off("channel:message:deleted", onDeleted);
      socket.off("message:reactions:updated", onReactions);
      socket.off("channel:typing:update", onTyping);
    };
  }, [channelId, key, addMessage, updateMessage, removeMessage, setTyping, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [list.length, scrollToBottom]);

  const emitTyping = (isTyping: boolean) => {
    getSocket().emit("channel:typing", { channelId, typing: isTyping });
  };

  // Track typing input activity via interval? Simple: emit true on send focus is handled in input wrapper below.
  // We hook global keydown in message input container via onSend wrapper — instead emit typing on each keystroke with debounce here:
  useEffect(() => {
    const handler = () => {
      emitTyping(true);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => emitTyping(false), 2000);
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const handleSend = (content: string, attachments: ChatMessage["attachments"]) => {
    emitTyping(false);
    if (editing) {
      getSocket().emit("channel:message:edit", { messageId: editing.id, content }, () => {});
      // Optimistic
      updateMessage(key, editing.id, { content, edited: true });
      setEditing(null);
      return;
    }
    const clean = content.trim();
    if (!clean && attachments.length === 0) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const u = useAuthStore.getState().user;
    if (u) {
      addMessage(key, {
        id: tempId,
        tempId,
        content: clean || "(image)",
        channelId,
        edited: false,
        createdAt: new Date().toISOString(),
        author: { id: u.id, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl },
        replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, author: { id: replyTo.author.id, username: replyTo.author.username, displayName: replyTo.author.displayName } } : null,
        reactions: [],
        attachments,
      });
      scrollToBottom();
    }
    getSocket().emit(
      "channel:message:send",
      { channelId, content: clean || "(image)", replyToId: replyTo?.id, tempId, attachments },
      (res: unknown) => {
        const r = res as { ok?: boolean; message?: Record<string, unknown>; error?: string };
        if (r?.ok && r.message) {
          // Replace temp
          const real = toChatMessage({ ...r.message, tempId });
          // remove temp + add real (addMessage dedupes by tempId)
          addMessage(key, real);
          // remove the optimistic temp entry with id=tempId
          removeMessage(key, tempId);
          addMessage(key, { ...real, tempId: undefined });
        }
      }
    );
    setReplyTo(null);
  };

  const handleDelete = (m: ChatMessage) => {
    if (!confirm("Delete this message?")) return;
    getSocket().emit("channel:message:delete", { messageId: m.id });
    removeMessage(key, m.id);
  };

  const handleReact = (m: ChatMessage, emoji: string) => {
    getSocket().emit("reaction:toggle", { messageId: m.id, emoji });
  };

  if (!channel) return <div className="flex flex-1 items-center justify-center text-speakit-muted">Select a channel</div>;

  if (channel.type === "VOICE") {
    return <VoiceChannelView channelId={channel.id} serverId={channel.serverId} channelName={channel.name} />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-speakit-bg">
      <div className="flex h-12 items-center gap-2 border-b border-black/30 px-4 shadow-sm">
        <Hash size={18} className="text-speakit-muted" />
        <span className="font-bold text-white">{channel.name}</span>
        {channel.topic && <span className="truncate text-xs text-speakit-muted">| {channel.topic}</span>}
        <div className="flex-1" />
        <button onClick={() => setShowMembers(!showMembers)} className="rounded p-1.5 text-speakit-muted hover:text-white" title="Toggle members">
          <Users size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto py-3">
            {loading && <div className="px-4 text-sm text-speakit-muted">Loading messages…</div>}
            {!loading && list.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Hash size={48} className="mx-auto mb-3 text-white/20" />
                <h3 className="text-lg font-bold text-white">Welcome to #{channel.name}!</h3>
                <p className="text-sm text-speakit-muted">This is the start of the #{channel.name} channel.</p>
              </div>
            )}
            {list.map((m) => (
              <MessageItem key={m.id} msg={m} onReply={setReplyTo} onEdit={setEditing} onDelete={handleDelete} onReact={handleReact} />
            ))}
            <div ref={bottomRef} />
          </div>
          {typingList.length > 0 && (
            <div className="px-4 pb-1 text-xs text-speakit-muted">
              {typingList.map((t) => t.displayName).join(", ")} {typingList.length === 1 ? "is" : "are"} typing…
            </div>
          )}
          <MessageInput
            placeholder={`Message #${channel.name}`}
            replyTo={replyTo}
            editing={editing}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onSend={handleSend}
          />
        </div>

        {showMembers && serverDetail && (
          <div className="hidden w-60 flex-col gap-0.5 overflow-y-auto bg-[#2b2d31] p-3 lg:flex">
            <div className="mb-2 text-[11px] font-bold uppercase text-speakit-muted">Members — {serverDetail.members.length}</div>
            {serverDetail.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                <Avatar name={m.displayName} color={m.avatarColor} src={m.avatarUrl || undefined} size={32} status={m.status} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{m.displayName}</div>
                  <div className="truncate text-[11px] text-speakit-muted">@{m.username}{m.role === "owner" ? " • owner" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VoiceChannelView({ channelId, serverId, channelName }: { channelId: string; serverId: string; channelName: string }) {
  const voice = useVoiceStore();
  const [joiningLocal, setJoiningLocal] = useState(false);
  const [switching, setSwitching] = useState(false);
  const isConnectedHere = voice.channelId === channelId;
  const connectedElsewhere = !!voice.channelId && !isConnectedHere;
  const peers = isConnectedHere ? voice.peers : [];

  const handleJoin = async () => {
    setJoiningLocal(true);
    try {
      await voiceActions.join(channelId, serverId);
    } finally {
      setJoiningLocal(false);
    }
  };

  const handleSwitch = async () => {
    setSwitching(true);
    try {
      voiceActions.leave();
      await new Promise((r) => setTimeout(r, 300));
      await voiceActions.join(channelId, serverId);
    } finally {
      setSwitching(false);
    }
  };

  const handleLeave = () => {
    voiceActions.leave();
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-speakit-bg">
      <div className="flex h-12 items-center gap-2 border-b border-black/30 px-4">
        <Volume2 size={18} className="text-speakit-muted" />
        <span className="font-bold text-white">{channelName}</span>
        <span className="text-xs text-speakit-muted">Voice channel</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        {connectedElsewhere ? (
          <>
            <Volume2 size={64} className="text-speakit-green/60" />
            <h3 className="text-xl font-bold text-white">You&apos;re in another voice channel</h3>
            <p className="max-w-md text-center text-sm text-speakit-muted">
              Voice stays connected while you browse. Switch to join {channelName} instead.
            </p>
            <button
              onClick={handleSwitch}
              disabled={switching}
              className="rounded-md bg-speakit-blurple px-6 py-2.5 font-semibold text-white hover:bg-[#4752c4] disabled:opacity-50"
            >
              {switching ? "Switching…" : `Switch to ${channelName}`}
            </button>
          </>
        ) : !isConnectedHere ? (
          <>
            <Volume2 size={64} className="text-white/20" />
            <h3 className="text-xl font-bold text-white">Jump into voice!</h3>
            <p className="max-w-md text-center text-sm text-speakit-muted">
              Voice channels are live. Your audio stays in this channel only. Allow mic access to talk.
            </p>
            <button
              onClick={handleJoin}
              disabled={joiningLocal || voice.joining}
              className="rounded-md bg-speakit-green px-6 py-2.5 font-semibold text-white hover:bg-[#1a8a4a] disabled:opacity-50"
            >
              {joiningLocal || voice.joining ? "Connecting…" : "Join Voice"}
            </button>
          </>
        ) : (
          <div className="w-full max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-white">Connected • {peers.length + 1} in voice</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => useVoiceStore.getState().setSelfMuted(!voice.selfMuted)}
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                >
                  {voice.selfMuted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={() => useVoiceStore.getState().setSelfDeafened(!voice.selfDeafened)}
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                >
                  {voice.selfDeafened ? "Undeafen" : "Deafen"}
                </button>
                <button onClick={handleLeave} className="rounded-md bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600">
                  Disconnect
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="flex flex-col items-center gap-2 rounded-lg bg-[#2b2d31] p-4">
                <Avatar name="You" color="#5865f2" size={56} />
                <span className="text-sm font-semibold text-white">You {voice.selfMuted ? "(muted)" : ""}</span>
              </div>
              {peers.map((p) => (
                <div key={p.userId} className="flex flex-col items-center gap-2 rounded-lg bg-[#2b2d31] p-4">
                  <Avatar name={p.displayName} color={p.avatarColor} size={56} />
                  <span className="text-sm font-semibold text-white">{p.displayName}</span>
                  <span className="text-[11px] text-speakit-muted">{p.muted ? "muted" : "live"}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-speakit-muted">Audio plays globally — you can browse other channels while connected.</p>
          </div>
        )}
      </div>
    </div>
  );
}
