"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useChatStore, type ChatMessage } from "@/store/useChatStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppStore } from "@/store/useAppStore";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { Avatar } from "./Avatar";
import { Bell, BellOff } from "lucide-react";

export function DMView({ conversationId }: { conversationId: string }) {
  const { setMessages, addMessage, setTyping, typing, messages } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [other, setOther] = useState<{ id: string; username: string; displayName: string; avatarColor: string; avatarUrl?: string; status: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const key = `dm:${conversationId}`;
  const list = messages[key] ?? [];
  const typingList = typing[key] ?? [];
  const muted = useAppStore((s) => s.mutedDMs.includes(conversationId));
  const toggleMute = useAppStore((s) => s.toggleMute);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/dms/${conversationId}/messages?limit=100`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setOther(data.other);
          setMessages(
            key,
            (data.messages ?? []).map((m: { id: string; content: string; edited: boolean; createdAt: string; author: ChatMessage["author"]; attachments?: ChatMessage["attachments"] }) => ({
              id: m.id,
              content: m.content,
              conversationId,
              edited: m.edited,
              createdAt: m.createdAt,
              author: m.author,
              reactions: [],
              attachments: m.attachments ?? [],
            }))
          );
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      getSocket().emit("dm:join", { conversationId });
      // Opening the DM clears its pings.
      void useAppStore.getState().markMentionsRead({ conversationId });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const resync = () => {
      getSocket().emit("dm:join", { conversationId });
      void (async () => {
        try {
          const res = await fetch(`/api/dms/${conversationId}/messages?limit=100`, { cache: "no-store" });
          const data = await res.json();
          if (res.ok) {
            setOther(data.other);
            setMessages(
              key,
              (data.messages ?? []).map((m: { id: string; content: string; edited: boolean; createdAt: string; author: ChatMessage["author"]; attachments?: ChatMessage["attachments"] }) => ({
                id: m.id,
                content: m.content,
                conversationId,
                edited: m.edited,
                createdAt: m.createdAt,
                author: m.author,
                reactions: [],
                attachments: m.attachments ?? [],
              }))
            );
          }
        } catch {
          /* ignore */
        }
      })();
    };
    window.addEventListener("speakit:resync", resync);
    return () => window.removeEventListener("speakit:resync", resync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = (msg: { conversationId: string; id: string; content: string; createdAt: string; edited: boolean; author: ChatMessage["author"]; tempId?: string; attachments?: ChatMessage["attachments"] }) => {
      if (msg.conversationId !== conversationId) return;
      addMessage(key, { id: msg.id, content: msg.content, conversationId, edited: msg.edited, createdAt: msg.createdAt, author: msg.author, reactions: [], attachments: msg.attachments ?? [] });
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    const onTyping = (p: { conversationId: string; userId: string; typing: boolean }) => {
      if (p.conversationId !== conversationId) return;
      const cur = useChatStore.getState().typing[key] ?? [];
      if (p.typing) {
        if (!cur.some((t) => t.userId === p.userId)) setTyping(key, [...cur, { userId: p.userId, displayName: other?.displayName ?? "Someone" }]);
      } else {
        setTyping(key, cur.filter((t) => t.userId !== p.userId));
      }
    };
    socket.on("dm:message:new", onNew);
    socket.on("dm:typing:update", onTyping);
    return () => {
      socket.off("dm:message:new", onNew);
      socket.off("dm:typing:update", onTyping);
    };
  }, [conversationId, key, addMessage, setTyping, other?.displayName]);

  const handleSend = (content: string, attachments: ChatMessage["attachments"]) => {
    const clean = content.trim();
    if (!clean && attachments.length === 0) return;
    const tempId = `temp-${Date.now()}`;
    const u = useAuthStore.getState().user;
    if (u) {
      addMessage(key, {
        id: tempId,
        tempId,
        content: clean || "(image)",
        conversationId,
        edited: false,
        createdAt: new Date().toISOString(),
        author: { id: u.id, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl },
        reactions: [],
        attachments,
      });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    }
    getSocket().emit("dm:typing", { conversationId, typing: false });
    getSocket().emit("dm:message:send", { conversationId, content: clean || "(image)", tempId, attachments }, (res: unknown) => {
      const r = res as { ok?: boolean; message?: { id: string; content: string; createdAt: string; edited: boolean; author: ChatMessage["author"]; attachments?: ChatMessage["attachments"] } };
      if (r?.ok && r.message) {
        const all = useChatStore.getState().messages[key] ?? [];
        const withoutTemp = all.filter((m) => m.tempId !== tempId && m.id !== tempId);
        setMessages(key, [...withoutTemp, { id: r.message.id, content: r.message.content, conversationId, edited: r.message.edited, createdAt: r.message.createdAt, author: r.message.author, reactions: [], attachments: r.message.attachments ?? [] }]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-speakit-bg">
      <div className="flex h-12 items-center gap-2 border-b border-black/30 px-4">
        {other && <Avatar name={other.displayName} color={other.avatarColor} src={other.avatarUrl || undefined} size={28} status={other.status} />}
        <span className="font-bold text-white">{other ? other.displayName : "Direct Message"}</span>
        {other && <span className="text-xs text-speakit-muted">@{other.username}</span>}
        <div className="flex-1" />
        <button onClick={() => void toggleMute("dm", conversationId)} title={muted ? "Unmute DMs" : "Mute DMs"} className="rounded p-1.5 text-speakit-muted hover:text-white">
          {muted ? <BellOff size={16} /> : <Bell size={16} />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        {loading && <div className="px-4 text-sm text-speakit-muted">Loading…</div>}
        {!loading && list.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-speakit-muted">
            <div className="mb-2 text-lg font-bold text-white">Start the conversation 👋</div>
            Say hi to {other?.displayName ?? "your friend"}!
          </div>
        )}
        {list.map((m) => (
          <MessageItem key={m.id} msg={m} onReply={() => {}} onEdit={() => {}} onDelete={() => {}} onReact={() => {}} onPin={() => {}} />
        ))}
        <div ref={bottomRef} />
      </div>
      {typingList.length > 0 && <div className="px-4 pb-1 text-xs text-speakit-muted">typing…</div>}
      <MessageInput placeholder={other ? `Message @${other.username}` : "Message"} replyTo={null} editing={null} onCancelReply={() => {}} onCancelEdit={() => {}} onSend={handleSend} />
    </div>
  );
}
