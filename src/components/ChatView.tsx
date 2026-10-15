"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hash, Volume2, Users } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { pokeActive } from "@/hooks/useAutoIdle";
import { useChatStore, type ChatMessage } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { PinsModal, PinCount, type PinItem } from "./PinsModal";
import { useAuthStore } from "@/store/useAuthStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import { voiceActions, canShareScreen, hasTurnConfigured } from "@/hooks/useVoice";
import { Avatar } from "./Avatar";
import { MemberList } from "./MemberList";

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
    pinned: Boolean(raw.pinned),
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
      // Opening the channel clears its pings.
      void useAppStore.getState().markMentionsRead({ channelId });
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, key, setMessages, scrollToBottom]);

  // Socket listeners
  useEffect(() => {
    const resync = () => {
      // Reconnects drop room membership: rejoin + reload this channel.
      getSocket().emit("channel:join", { channelId });
      void (async () => {
        try {
          const res = await fetch(`/api/channels/${channelId}/messages?limit=100`, { cache: "no-store" });
          const data = await res.json();
          if (res.ok) setMessages(key, (data.messages ?? []).map((m: Record<string, unknown>) => toChatMessage(m)));
        } catch {
          /* ignore */
        }
      })();
    };
    window.addEventListener("speakit:resync", resync);
    return () => window.removeEventListener("speakit:resync", resync);
  }, [channelId, key, setMessages]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = (msg: Record<string, unknown>) => {
      if (String(msg.channelId) !== channelId) return;
      const incoming = toChatMessage({ ...msg, reactions: [] });
      incoming.tempId = undefined; // server echo — never show "sending" on real messages
      addMessage(key, incoming);
      scrollToBottom();
    };
    const onUpdated = (p: { id: string; channelId: string; content?: string; edited?: boolean; updatedAt?: string; pinned?: boolean }) => {
      if (p.channelId !== channelId) return;
      const patch: Partial<ChatMessage> = {};
      if (p.content !== undefined) patch.content = p.content;
      if (p.edited !== undefined) patch.edited = p.edited;
      if (p.updatedAt !== undefined) patch.updatedAt = p.updatedAt;
      if (p.pinned !== undefined) patch.pinned = p.pinned;
      updateMessage(key, p.id, patch);
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
    // Saying anything = proof of life: instantly restore pre-idle status.
    pokeActive();
    emitTyping(false);
    if (editing) {
      const cleanEdit = content.trim().slice(0, 500);
      if (!cleanEdit) return;
      getSocket().emit("channel:message:edit", { messageId: editing.id, content: cleanEdit }, () => {});
      // Optimistic
      updateMessage(key, editing.id, { content: cleanEdit, edited: true });
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
        content: clean,
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
      { channelId, content: clean, replyToId: replyTo?.id, tempId, attachments },
      (res: unknown) => {
        const r = res as { ok?: boolean; message?: Record<string, unknown>; error?: string };
        if (r?.ok && r.message) {
          // Swap the optimistic echo for the real message (drops tempId so
          // "sending…" clears; skips if the live broadcast already added it).
          const real = toChatMessage(r.message);
          real.tempId = undefined;
          const all = useChatStore.getState().messages[key] ?? [];
          const withoutTemp = all.filter((m) => m.tempId !== tempId && m.id !== tempId);
          if (!withoutTemp.some((m) => m.id === real.id)) withoutTemp.push(real);
          setMessages(key, withoutTemp);
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

  const handlePin = (m: ChatMessage) => {
    getSocket().emit("channel:message:pin", { messageId: m.id, pinned: !m.pinned }, (res: unknown) => {
      const r = res as { ok?: boolean; error?: string };
      if (!r?.ok && r?.error) alert(r.error);
    });
  };

  const [showPins, setShowPins] = useState(false);
  const [pins, setPins] = useState<PinItem[]>([]);

  const openPins = async () => {
    setShowPins(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/pins`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setPins(data.pins ?? []);
    } catch {
      /* ignore */
    }
  };

  const jumpTo = (messageId: string) => {
    setShowPins(false);
    requestAnimationFrame(() => {
      document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const unpin = (messageId: string) => {
    getSocket().emit("channel:message:pin", { messageId, pinned: false });
    setPins((p) => p.filter((x) => x.id !== messageId));
  };

  if (!channel) return <div className="flex flex-1 items-center justify-center text-speakit-muted">Select a channel</div>;

  if (channel.type === "VOICE") {
    return <VoiceChannelView channelId={channel.id} serverId={channel.serverId} channelName={channel.name} />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-speakit-bg">
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-speakit-bg/80 px-3 shadow-sm backdrop-blur-xl sm:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-speakit-blurple/30 to-speakit-accent/20 ring-1 ring-white/10">
          <Hash size={15} className="text-speakit-accent" />
        </span>
        <span className="truncate text-[15px] font-extrabold tracking-tight text-white">{channel.name}</span>
        {channel.topic && <span className="hidden max-w-md truncate text-xs text-speakit-muted/80 md:block">| {channel.topic}</span>}
        <div className="flex-1" />
        <PinCount count={list.filter((m) => m.pinned).length} onClick={() => void openPins()} />
        <button onClick={() => setShowMembers(!showMembers)} className={`rounded-lg p-2 transition ${showMembers ? "bg-speakit-blurple/25 text-white" : "text-speakit-muted hover:bg-white/10 hover:text-white"}`} title="Toggle members">
          <Users size={17} />
        </button>
      </div>
      <PinsModal open={showPins} onClose={() => setShowPins(false)} pins={pins} channelName={channel.name} onJump={jumpTo} onUnpin={unpin} />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="msg-list smooth-scroll flex-1 overflow-y-auto py-3">
            {loading && (
              <div className="space-y-3 px-4 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="skeleton h-3 w-40 rounded-full" />
                      <div className="skeleton h-3 rounded-full" style={{ width: `${70 - i * 12}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && list.length === 0 && (
              <div className="animate-fade-up px-4 py-10 text-center">
                <div className="brand-gradient mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl shadow-glow">
                  <Hash size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-extrabold tracking-tight text-white">Welcome to #{channel.name}!</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-speakit-muted">This is the start of something great. Say hi and kick things off.</p>
              </div>
            )}
            {list.map((m) => (
              <MessageItem key={m.id} msg={m} channelServerId={serverDetail?.id} onReply={setReplyTo} onEdit={setEditing} onDelete={handleDelete} onReact={handleReact} onPin={handlePin} />
            ))}
            <div ref={bottomRef} />
          </div>
          {typingList.length > 0 && (
            <div className="flex items-center gap-2 px-4 pb-1.5 text-xs font-medium text-speakit-muted">
              <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 ring-1 ring-white/10">
                <span className="typing-dot h-1 w-1 rounded-full bg-speakit-accent" />
                <span className="typing-dot h-1 w-1 rounded-full bg-speakit-accent" />
                <span className="typing-dot h-1 w-1 rounded-full bg-speakit-accent" />
              </span>
              <span className="truncate">{typingList.map((t) => t.displayName).join(", ")} {typingList.length === 1 ? "is" : "are"} typing…</span>
            </div>
          )}
          <MessageInput
            placeholder={`Message #${channel.name}`}
            replyTo={replyTo}
            editing={editing}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onSend={handleSend}
            serverId={channel.serverId}
            mentionables={serverDetail?.members ?? []}
          />
        </div>

        {showMembers && serverDetail && (
          <div className="hidden w-60 shrink-0 overflow-y-auto border-l border-white/[0.06] bg-speakit-sidebar/60 p-3 backdrop-blur lg:block">
            <MemberList members={serverDetail.members} roles={serverDetail.roles} ownerId={serverDetail.ownerId} />
          </div>
        )}
      </div>
    </div>
  );
}

function CallTimer({ since }: { since: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return null;
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="tabular-nums">{mm}:{ss}</span>;
}

function VoiceChannelView({ channelId, serverId, channelName }: { channelId: string; serverId: string; channelName: string }) {
  const voice = useVoiceStore();
  const [joiningLocal, setJoiningLocal] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [retryingPeer, setRetryingPeer] = useState<string | null>(null);
  const isConnectedHere = voice.channelId === channelId;
  const connectedElsewhere = !!voice.channelId && !isConnectedHere;
  const peers = isConnectedHere ? voice.peers : [];
  const [shareSupported] = useState(() => {
    try {
      return canShareScreen();
    } catch {
      return true;
    }
  });

  const handleJoin = async () => {
    useVoiceStore.getState().setJoinError(null);
    setJoiningLocal(true);
    try {
      await voiceActions.join(channelId, serverId);
    } finally {
      setJoiningLocal(false);
    }
  };

  const handleRetryPeer = async (peerUserId: string) => {
    // Targeted retry: leave + rejoin rebuilds every peer connection.
    setRetryingPeer(peerUserId);
    try {
      await voiceActions.rejoin();
    } finally {
      setRetryingPeer(null);
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

  const screens = isConnectedHere ? Object.entries(voice.screenStreams) : [];

  useEffect(() => {
    // Attach screen streams to their <video> tiles (runs after every render — cheap).
    if (voice.selfScreen) {
      const el = document.getElementById("voice-screen-self") as HTMLVideoElement | null;
      if (el && el.srcObject !== voice.selfScreen) {
        el.srcObject = voice.selfScreen;
        void el.play().catch(() => {});
      }
    }
    for (const [userId, stream] of screens) {
      const el = document.getElementById(`voice-screen-${userId}`) as HTMLVideoElement | null;
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        void el.play().catch(() => {});
      }
    }
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-speakit-bg">
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-speakit-bg/80 px-3 backdrop-blur-xl sm:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
          <Volume2 size={15} className="text-emerald-300" />
        </span>
        <span className="truncate text-[15px] font-extrabold tracking-tight text-white">{channelName}</span>
        <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-speakit-muted sm:block">Voice channel</span>
      </div>
      <div className="smooth-scroll flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-4 sm:p-8">
        {connectedElsewhere ? (
          <>
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
              <Volume2 size={36} className="text-emerald-300" />
            </span>
            <h3 className="text-center text-xl font-extrabold tracking-tight text-white">You&apos;re in another voice channel</h3>
            <p className="max-w-md text-center text-sm text-speakit-muted">
              Voice stays connected while you browse. Switch to join {channelName} instead.
            </p>
            <button
              onClick={handleSwitch}
              disabled={switching}
              className="brand-gradient rounded-full px-8 py-3 font-extrabold text-white shadow-glow transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {switching ? "Switching…" : `Switch to ${channelName}`}
            </button>
          </>
        ) : !isConnectedHere ? (
          <>
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/[0.05] ring-1 ring-white/10">
              <Volume2 size={36} className="text-speakit-muted" />
            </span>
            <h3 className="text-center text-xl font-extrabold tracking-tight text-white">Jump into voice!</h3>
            <p className="max-w-md text-center text-sm text-speakit-muted">
              Voice channels are live. Your audio stays in this channel only. Allow mic access to talk — or join without a mic to just listen.
            </p>
            {voice.joinError && (
              <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-center text-sm text-rose-300">
                {voice.joinError}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={handleJoin}
                disabled={joiningLocal || voice.joining}
                className="rounded-full bg-emerald-500 px-8 py-3 font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
              >
                {joiningLocal || voice.joining ? "Connecting…" : "Join Voice"}
              </button>
              {(joiningLocal || voice.joining) && (
                <button
                  onClick={() => {
                    voiceActions.leave();
                    setJoiningLocal(false);
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/[0.12]"
                >
                  Cancel
                </button>
              )}
            </div>
            <p className="max-w-md text-center text-[11px] text-speakit-muted">
              On mobile data? Voice uses a direct connection — if it never connects, the server may need a TURN relay (admin setting).
            </p>
          </>
        ) : (
          <div className="w-full max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 font-bold text-white">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-speakit-green" />
                <span className="truncate">{channelName} • {peers.length + 1} in voice • <CallTimer since={voice.connectedAt} /></span>
              </h3>
              <div className="flex flex-wrap gap-2">
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
                {shareSupported ? (
                  <button
                    onClick={() => void (voice.sharingSelf ? voiceActions.stopShare() : voiceActions.startShare())}
                    title={voice.sharingSelf ? "Stop sharing your screen" : "Share your screen"}
                    className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                  >
                    {voice.sharingSelf ? "Stop share" : "Share screen"}
                  </button>
                ) : (
                  <span title="Screen sharing isn't supported on this device/browser" className="cursor-not-allowed rounded-md bg-white/5 px-3 py-1.5 text-sm text-speakit-muted">
                    Share N/A
                  </span>
                )}
                <button onClick={handleLeave} className="rounded-md bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600">
                  Disconnect
                </button>
              </div>
            </div>
            {voice.micBlocked && (
              <div className="mb-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-2.5 text-center text-xs text-yellow-200">
                Microphone is blocked — you&apos;re listen-only. Allow mic access in your browser settings, then Reconnect.
              </div>
            )}
            {voice.joinError && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-center text-xs text-red-300">
                {voice.joinError}{" "}
                <button onClick={() => void voiceActions.rejoin()} className="font-bold underline">Reconnect</button>
              </div>
            )}
            {(screens.length > 0 || voice.selfScreen) && (
              <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                {voice.selfScreen && (
                  <div className="overflow-hidden rounded-xl bg-black ring-1 ring-speakit-green">
                    <video id="voice-screen-self" autoPlay playsInline muted className="max-h-80 w-full object-contain" />
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span className="rounded bg-red-500 px-1.5 py-0.5 font-bold text-white">LIVE</span>
                      <span className="font-semibold text-white">Your screen</span>
                    </div>
                  </div>
                )}
                {screens.map(([userId]) => {
                  const peer = peers.find((p) => p.userId === userId);
                  return (
                    <div key={userId} className="overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                      <video id={`voice-screen-${userId}`} autoPlay playsInline className="max-h-80 w-full object-contain" />
                      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <span className="rounded bg-red-500 px-1.5 py-0.5 font-bold text-white">LIVE</span>
                        <span className="font-semibold text-white">{peer ? peer.displayName : "Someone"}&apos;s screen</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <div
                className="flex flex-col items-center gap-2 rounded-3xl border border-white/[0.06] p-3 shadow-card sm:p-5"
                style={{ background: "linear-gradient(135deg, #6c6cf533, rgb(var(--sp-card)) 70%)" }}
              >
                <Avatar name="You" color="#6c6cf5" size={56} />
                <span className="text-center text-sm font-bold text-white">You {voice.selfMuted ? "(muted)" : ""}{voice.sharingSelf ? " • sharing" : ""}</span>
                {voice.micBlocked && <span className="text-[11px] text-amber-200/80">listen-only (no mic)</span>}
                {voice.sharingSelf && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-extrabold text-white">LIVE</span>}
              </div>
              {peers.map((p) => {
                const sharing = screens.some(([id]) => id === p.userId);
                const conn = voice.peerConn[p.userId];
                const struggling = conn === "connecting" || conn === "new" || conn === "disconnected" || conn === "failed";
                return (
                  <div
                    key={p.userId}
                    className="flex flex-col items-center gap-2 rounded-3xl border border-white/[0.06] p-3 shadow-card sm:p-5"
                    style={{ background: `linear-gradient(135deg, ${p.avatarColor}33, rgb(var(--sp-card)) 70%)` }}
                  >
                    <Avatar name={p.displayName} color={p.avatarColor} src={p.avatarUrl || undefined} size={56} />
                    <span className="max-w-full truncate text-center text-sm font-semibold text-white">{p.displayName}</span>
                    <span className="flex items-center gap-1.5 text-[11px]">
                      {sharing ? (
                        <span className="rounded bg-red-500 px-1.5 py-0.5 font-bold text-white">LIVE</span>
                      ) : struggling ? (
                        <button
                          onClick={() => void handleRetryPeer(p.userId)}
                          disabled={retryingPeer === p.userId}
                          className="rounded bg-yellow-500/20 px-1.5 py-0.5 font-semibold text-yellow-200 hover:bg-yellow-500/30"
                          title={conn === "failed" && !hasTurnConfigured() ? "Direct connection failed — server may need a TURN relay. Click to retry." : "Still connecting… click to retry."}
                        >
                          {retryingPeer === p.userId ? "retrying…" : conn === "failed" ? "failed — retry?" : "connecting…"}
                        </button>
                      ) : (
                        <span className="text-speakit-muted">{p.muted ? "muted" : "live"}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {peers.length === 0 && screens.length === 0 && !voice.selfScreen && (
              <p className="mt-2 text-center text-xs text-speakit-muted">
                You&apos;re the only one here — friends joining this channel will show up above.
              </p>
            )}
            {voice.sharingSelf && (
              <p className="mt-2 text-center text-xs text-speakit-green">You&apos;re sharing your screen — stop sharing from your browser&apos;s picker or the button above.</p>
            )}
            <p className="mt-1 text-center text-xs text-speakit-muted">Audio plays globally — you can browse other channels while connected.</p>
          </div>
        )}
      </div>
    </div>
  );
}
