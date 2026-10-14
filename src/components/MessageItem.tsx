"use client";

import { useMemo, useState } from "react";
import { Reply, Pencil, Trash2, Smile, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { splitShortcodes, emojiUrlFor } from "@/lib/emoji";
import { previewForMessage, shouldShowBody } from "@/lib/messagePreview";
import type { ServerEmoji } from "@/store/useAppStore";
import type { ChatMessage } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";
import { displayColorFor } from "@/lib/memberGroups";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export function MessageItem({
  msg,
  channelServerId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
}: {
  msg: ChatMessage;
  channelServerId?: string;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onPin: (m: ChatMessage) => void;
}) {
  const { user } = useAuthStore();
  const { serverDetail, myEmojis } = useAppStore();
  const { openProfile } = useProfileStore();
  const [showEmoji, setShowEmoji] = useState(false);
  const isMine = user?.id === msg.author.id;

  const byServer = useMemo(() => {
    const map: Record<string, ServerEmoji[]> = {};
    if (serverDetail) map[serverDetail.id] = serverDetail.customEmojis;
    return map;
  }, [serverDetail]);

  const parts = useMemo(() => splitShortcodes(msg.content), [msg.content]);
  const showBody = shouldShowBody(msg.content);
  // Role-colored username (matches the member list): look the author up in
  // this server's members. DMs / other servers fall back to white.
  const inThisServer = !!channelServerId && serverDetail?.id === channelServerId;
  const authorMember = inThisServer
    ? serverDetail?.members.find((m) => m.id === msg.author.id)
    : undefined;
  const authorColor = authorMember ? displayColorFor(authorMember, serverDetail?.roles ?? []) : null;
  const replyPreview = useMemo(
    () => (msg.replyTo ? previewForMessage(msg.replyTo.content, msg.replyTo.attachments ?? []) : ""),
    [msg.replyTo]
  );

  return (
    <div id={`msg-${msg.id}`} className="group relative flex scroll-mt-16 gap-3 px-4 py-1.5 hover:bg-black/20">
      <button onClick={() => openProfile(msg.author.id)} title="View profile" className="h-fit">
        <Avatar name={msg.author.displayName} color={msg.author.avatarColor} src={msg.author.avatarUrl || undefined} size={40} />
      </button>
      <div className="min-w-0 flex-1">
        {msg.replyTo && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-speakit-muted">
            <Reply size={12} />
            <span className="font-semibold">{msg.replyTo.author.displayName}</span>
            <span className="truncate opacity-80">{replyPreview || <i>attachment</i>}</span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <button
            onClick={() => openProfile(msg.author.id)}
            className="text-sm font-semibold text-white hover:underline"
            style={authorColor ? { color: authorColor } : undefined}
          >
            {msg.author.displayName}
          </button>
          <span className="text-[11px] text-speakit-muted">@{msg.author.username} • {formatTime(msg.createdAt)}</span>
          {msg.edited && <span className="text-[10px] text-speakit-muted">(edited)</span>}
          {msg.pinned && <span title="Pinned" className="text-[10px] text-yellow-400">📌</span>}
          {msg.tempId && <span className="text-[10px] text-speakit-muted">sending…</span>}
        </div>
        {showBody && (
          <div className="whitespace-pre-wrap break-words text-[15px] text-speakit-text">
            {parts.map((p, i) =>
              "text" in p ? (
                <span key={i}>{p.text}</span>
              ) : (
                <CustomGlyph key={i} name={p.emoji} url={emojiUrlFor(p.emoji, channelServerId, byServer, myEmojis)} />
              )
            )}
          </div>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {msg.attachments.filter((a) => !a.mime.startsWith("audio/")).map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.name}>
                  <img src={a.url} alt={a.name} loading="lazy" className="max-h-64 max-w-full rounded-lg object-cover hover:opacity-90 sm:max-w-sm" />
                </a>
              ))}
            </div>
            {msg.attachments.filter((a) => a.mime.startsWith("audio/")).map((a) => (
              <audio key={a.url} src={a.url} controls preload="metadata" className="h-9 w-full max-w-sm" />
            ))}
          </div>
        )}
        {msg.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {msg.reactions.map((r) => {
              const custom = /^:([a-z0-9_]{2,32}):$/.exec(r.emoji);
              const url = custom ? emojiUrlFor(custom[1], channelServerId, byServer, myEmojis) : null;
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(msg, r.emoji)}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
                    r.me ? "border-speakit-blurple bg-speakit-blurple/30" : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                  title={r.users.join(", ")}
                >
                  {url ? <img src={url} alt={r.emoji} className="h-4 w-4 object-contain" /> : <span>{r.emoji}</span>}
                  <span className="font-semibold">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="absolute -top-2 right-4 hidden items-center gap-0.5 rounded-md bg-[#2b2d31] p-0.5 shadow-lg group-hover:flex">
        <button title="React" onClick={() => setShowEmoji((v) => !v)} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-yellow-400"><Smile size={15} /></button>
        <button title={msg.pinned ? "Unpin" : "Pin"} onClick={() => onPin(msg)} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-yellow-400"><Pin size={15} /></button>
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

function CustomGlyph({ name, url }: { name: string; url: string | null }) {
  if (!url) return <span>:{name}:</span>;
  return <img src={url} alt={`:${name}:`} title={`:${name}:`} className="inline h-6 w-6 object-contain align-[-4px]" loading="lazy" />;
}
