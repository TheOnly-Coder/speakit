"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Reply, Pencil, Trash2, Smile, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { Avatar, BotTag } from "./Avatar";
import { emojiUrlFor } from "@/lib/emoji";
import { MarkdownContent } from "@/lib/discordMarkdown";
import { previewForMessage, shouldShowBody } from "@/lib/messagePreview";
import type { ServerEmoji } from "@/store/useAppStore";
import type { ChatMessage } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useLocalAppearance } from "@/store/useLocalAppearance";
import { displayColorFor } from "@/lib/memberGroups";
import { ctxProps } from "./ContextMenu";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export const MessageItem = memo(function MessageItem({
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
  const compact = useLocalAppearance((s) => s.compact);
  const showTimestamps = useLocalAppearance((s) => s.showTimestamps);
  const msgSpacing = useLocalAppearance((s) => s.msgSpacing);
  const [showEmoji, setShowEmoji] = useState(false);
  const isMine = user?.id === msg.author.id;

  const byServer = useMemo(() => {
    const map: Record<string, ServerEmoji[]> = {};
    if (serverDetail) map[serverDetail.id] = serverDetail.customEmojis;
    return map;
  }, [serverDetail]);

  const resolveEmoji = useCallback(
    (name: string) => emojiUrlFor(name, channelServerId, byServer, myEmojis),
    [channelServerId, byServer, myEmojis]
  );
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

  const msgPad = Math.round((compact ? 2 : 6) * msgSpacing);
  return (
    <div
      id={`msg-${msg.id}`}
      className={`group relative mx-2 flex scroll-mt-16 gap-2.5 rounded-2xl px-3 py-1.5 transition-colors duration-150 hover:bg-white/[0.045] sm:gap-3 sm:px-3.5 ${compact ? "py-0.5" : "py-1.5"}`}
      style={{ paddingTop: msgPad, paddingBottom: msgPad }}
      {...ctxProps(() => [
        { type: "item" as const, label: "Reply", onClick: () => onReply(msg) },
        { type: "item" as const, label: msg.pinned ? "Unpin Message" : "Pin Message", onClick: () => onPin(msg) },
        { type: "item" as const, label: "Copy Text", onClick: () => void navigator.clipboard?.writeText(msg.content).catch(() => {}) },
        { type: "item" as const, label: "Copy Message ID", onClick: () => void navigator.clipboard?.writeText(msg.id).catch(() => {}) },
        ...(isMine ? [{ type: "item" as const, label: "Edit Message", hint: "E", onClick: () => onEdit(msg) }] : []),
        { type: "sep" as const },
        { type: "item" as const, label: "Delete Message", danger: true, onClick: () => onDelete(msg) },
      ])}
    >
      <button onClick={() => openProfile(msg.author.id)} title="View profile" className={`h-fit transition hover:scale-105 ${compact ? "hidden" : ""} msg-cozy-only`}>
        <Avatar name={msg.author.displayName} color={msg.author.avatarColor} src={msg.author.avatarUrl || undefined} size={40} />
      </button>
      <div className="min-w-0 flex-1">
        {msg.replyTo && (
          <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-speakit-muted ring-1 ring-white/[0.06]">
            <Reply size={12} className="shrink-0 text-speakit-accent" />
            <span className="shrink-0 font-bold text-speakit-text">{msg.replyTo.author.displayName}</span>
            <span className="truncate opacity-80">{replyPreview || <i>attachment</i>}</span>
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <button
            onClick={() => openProfile(msg.author.id)}
            className="flex min-w-0 max-w-full items-center gap-1.5 truncate text-[15px] font-bold tracking-tight text-white hover:underline"
            style={authorColor ? { color: authorColor } : undefined}
          >
            <span className="truncate">{msg.author.displayName}</span>
            {msg.author.isBot && <BotTag />}
          </button>
          <span className="shrink-0 text-[11px] font-medium text-speakit-muted/70">@{msg.author.username}{showTimestamps ? ` • ${formatTime(msg.createdAt)}` : ""}</span>
          {msg.edited && <span className="text-[10px] italic text-speakit-muted/70">(edited)</span>}
          {msg.pinned && <span title="Pinned" className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] ring-1 ring-amber-400/25">📌</span>}
          {msg.tempId && <span className="flex items-center gap-1 text-[10px] text-speakit-muted"><span className="h-1 w-1 animate-pulse rounded-full bg-speakit-muted" />sending…</span>}
        </div>
        {showBody && (
          <div className="mt-0.5 break-words text-[15px] leading-[1.55] text-speakit-text">
            <MarkdownContent text={msg.content} resolveEmoji={resolveEmoji} />
          </div>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {msg.attachments.filter((a) => !a.mime.startsWith("audio/")).map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.name} className="overflow-hidden rounded-2xl ring-1 ring-white/10 transition hover:ring-white/25">
                  <img src={a.url} alt={a.name} loading="lazy" decoding="async" className="max-h-64 max-w-full object-cover transition duration-300 hover:scale-[1.01] sm:max-w-sm" />
                </a>
              ))}
            </div>
            {msg.attachments.filter((a) => a.mime.startsWith("audio/")).map((a) => (
              <audio key={a.url} src={a.url} controls preload="metadata" className="h-9 w-full max-w-sm rounded-full" />
            ))}
          </div>
        )}
        {msg.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.reactions.map((r) => {
              const custom = /^:([a-z0-9_]{2,32}):$/.exec(r.emoji);
              const url = custom ? emojiUrlFor(custom[1], channelServerId, byServer, myEmojis) : null;
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(msg, r.emoji)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all hover:scale-105 active:scale-95",
                    r.me ? "bg-speakit-blurple/25 text-white shadow-glow ring-1 ring-speakit-blurple/50" : "bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/[0.1] hover:ring-white/20"
                  )}
                  title={r.users.join(", ")}
                >
                  {url ? <img src={url} alt={r.emoji} className="h-4 w-4 object-contain" /> : <span>{r.emoji}</span>}
                  <span className="font-extrabold tabular-nums">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="absolute -top-3 right-4 hidden items-center gap-0.5 rounded-full border border-white/10 bg-speakit-card/95 p-1 shadow-pop backdrop-blur-xl group-hover:flex">
        <button title="React" onClick={() => setShowEmoji((v) => !v)} className="rounded-full p-1.5 text-speakit-muted transition hover:bg-speakit-blurple/25 hover:text-amber-300"><Smile size={15} /></button>
        <button title={msg.pinned ? "Unpin" : "Pin"} onClick={() => onPin(msg)} className="rounded-full p-1.5 text-speakit-muted transition hover:bg-speakit-blurple/25 hover:text-amber-300"><Pin size={15} /></button>
        <button title="Reply" onClick={() => onReply(msg)} className="rounded-full p-1.5 text-speakit-muted transition hover:bg-speakit-blurple/25 hover:text-white"><Reply size={15} /></button>
        {isMine && <button title="Edit" onClick={() => onEdit(msg)} className="rounded-full p-1.5 text-speakit-muted transition hover:bg-speakit-blurple/25 hover:text-white"><Pencil size={15} /></button>}
        <button title="Delete" onClick={() => onDelete(msg)} className="rounded-full p-1.5 text-speakit-muted transition hover:bg-rose-500/25 hover:text-rose-300"><Trash2 size={15} /></button>
      </div>

      {showEmoji && (
        <div className="menu-pop absolute right-4 top-8 z-10 flex gap-1 rounded-2xl border border-white/10 bg-speakit-card/95 p-1.5 shadow-pop backdrop-blur-xl">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => { onReact(msg, e); setShowEmoji(false); }} className="rounded-xl p-1.5 text-lg transition hover:scale-125 hover:bg-white/10">{e}</button>
          ))}
        </div>
      )}
    </div>
  );
});
