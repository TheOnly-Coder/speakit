"use client";

import { useState } from "react";
import { Reply, Pencil, Trash2, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { Avatar } from "./Avatar";
import type { ChatMessage } from "@/store/useChatStore";
import { useAuthStore } from "@/store/useAuthStore";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export function MessageItem({
  msg,
  onReply,
  onEdit,
  onDelete,
  onReact,
}: {
  msg: ChatMessage;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
}) {
  const { user } = useAuthStore();
  const [showEmoji, setShowEmoji] = useState(false);
  const isMine = user?.id === msg.author.id;

  return (
    <div className="group relative flex gap-3 px-4 py-1.5 hover:bg-black/20">
      <Avatar name={msg.author.displayName} color={msg.author.avatarColor} src={msg.author.avatarUrl || undefined} size={40} />
      <div className="min-w-0 flex-1">
        {msg.replyTo && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-speakit-muted">
            <Reply size={12} />
            <span className="font-semibold">{msg.replyTo.author.displayName}</span>
            <span className="truncate opacity-80">{msg.replyTo.content}</span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white">{msg.author.displayName}</span>
          <span className="text-[11px] text-speakit-muted">@{msg.author.username} • {formatTime(msg.createdAt)}</span>
          {msg.edited && <span className="text-[10px] text-speakit-muted">(edited)</span>}
          {msg.tempId && <span className="text-[10px] text-speakit-muted">sending…</span>}
        </div>
        <div className="whitespace-pre-wrap break-words text-[15px] text-speakit-text">{msg.content}</div>
        {msg.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {msg.attachments.map((a) => (
              <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.name}>
                <img
                  src={a.url}
                  alt={a.name}
                  loading="lazy"
                  className="max-h-64 max-w-full rounded-lg object-cover hover:opacity-90 sm:max-w-sm"
                />
              </a>
            ))}
          </div>
        )}
        {msg.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(msg, r.emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
                  r.me ? "border-speakit-blurple bg-speakit-blurple/30" : "border-white/10 bg-white/5 hover:border-white/20"
                )}
                title={r.users.join(", ")}
              >
                <span>{r.emoji}</span>
                <span className="font-semibold">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="absolute -top-2 right-4 hidden items-center gap-0.5 rounded-md bg-[#2b2d31] p-0.5 shadow-lg group-hover:flex">
        <button title="React" onClick={() => setShowEmoji((v) => !v)} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-yellow-400"><Smile size={15} /></button>
        <button title="Reply" onClick={() => onReply(msg)} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white"><Reply size={15} /></button>
        {isMine && <button title="Edit" onClick={() => onEdit(msg)} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white"><Pencil size={15} /></button>}
        <button title="Delete" onClick={() => onDelete(msg)} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-red-400"><Trash2 size={15} /></button>
      </div>

      {showEmoji && (
        <div className="absolute right-4 top-8 z-10 flex gap-1 rounded-md bg-[#1e1f22] p-1.5 shadow-xl">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => { onReact(msg, e); setShowEmoji(false); }} className="rounded p-1 text-lg hover:bg-white/10">{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}
