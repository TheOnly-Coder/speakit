"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, Plus, Loader2, Smile, Gift } from "lucide-react";
import type { ChatMessage, ChatAttachment } from "@/store/useChatStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppStore } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase";
import { useLocalAppearance } from "@/store/useLocalAppearance";
import { EmojiPicker } from "./EmojiPicker";
import { GifPicker, type PickedGif } from "./GifPicker";
import { previewForMessage } from "@/lib/messagePreview";
import { Avatar, BotTag } from "./Avatar";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_LEN = 500;
const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/svg+xml",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm", "audio/x-wav",
];
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file";
}

export type Mentionable = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  isBot?: boolean;
};

export type CommandBot = {
  id: string;
  userId: string;
  name: string;
  username: string;
  avatarColor: string;
  avatarUrl: string;
  enabled: boolean;
  commands: { name: string; description: string }[];
};

type AutocompleteMenu =
  | { kind: "mention"; query: string; at: number; index: number }
  | { kind: "command"; query: string; index: number };

/** Figure out whether an @-mention or /-command menu should be open. */
type DetectedMenu =
  | { kind: "mention"; query: string; at: number }
  | { kind: "command"; query: string };

function detectMenu(text: string, caret: number): DetectedMenu | null {
  const before = text.slice(0, caret);
  // "/" commands: only when the message starts with "/" and the caret is
  // still inside the first word (Discord behavior).
  if (before.startsWith("/") && !before.slice(1).includes(" ") && !before.includes("\n")) {
    return { kind: "command", query: before.slice(1) };
  }
  const m = /(^|\s)@([a-zA-Z0-9_.]*)$/.exec(before);
  if (m) return { kind: "mention", query: m[2], at: before.length - m[2].length - 1 };
  return null;
}

export function MessageInput({
  placeholder,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
  mentionables,
  serverId,
}: {
  placeholder: string;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (content: string, attachments: ChatAttachment[]) => void;
  /** People (and bots) that "@" can complete. Server members in channels, participants in DMs. */
  mentionables?: Mentionable[];
  /** When set, "/" completes this server's installed bots + their commands. */
  serverId?: string | null;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { serverDetail, myEmojis } = useAppStore();
  const enterToSend = useLocalAppearance((s) => s.enterToSend);

  // ---- @ mentions + / bot commands ----
  const [commandBots, setCommandBots] = useState<CommandBot[]>([]);
  const [menu, setMenu] = useState<AutocompleteMenu | null>(null);

  // Installed bots for the "/" menu (server channels only — bots can't DM).
  useEffect(() => {
    if (!serverId) {
      setCommandBots([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/servers/${serverId}/bots`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d.bots)) setCommandBots(d.bots);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const refreshMenu = (text: string, caret: number) => {
    const found = detectMenu(text, caret);
    setMenu((prev) => {
      if (!found) return null;
      // Keep the highlight position while typing; recompute if the token moved.
      if (
        prev &&
        prev.kind === found.kind &&
        prev.query === found.query &&
        (found.kind !== "mention" || (prev as { at: number }).at === found.at)
      ) {
        return prev;
      }
      return { ...found, index: 0 };
    });
  };

  type MenuRow =
    | { key: string; type: "mention"; user: Mentionable }
    | { key: string; type: "command"; bot: CommandBot; name: string; description: string }
    | { key: string; type: "talk"; bot: CommandBot };

  const menuRows = (): MenuRow[] => {
    if (!menu) return [];
    if (menu.kind === "mention") {
      const q = menu.query.toLowerCase();
      return (mentionables ?? [])
        .filter(
          (u) =>
            !q ||
            u.username.toLowerCase().includes(q) ||
            u.displayName.toLowerCase().includes(q)
        )
        .slice(0, 8)
        .map((u) => ({ key: `m:${u.id}`, type: "mention", user: u }) as MenuRow);
    }
    const q = menu.query.toLowerCase();
    const rows: MenuRow[] = [];
    for (const bot of commandBots) {
      if (!bot.enabled) continue;
      for (const c of bot.commands) {
        if (!q || c.name.toLowerCase().includes(q)) {
          rows.push({ key: `c:${bot.id}:${c.name}`, type: "command", bot, name: c.name, description: c.description });
        }
        if (rows.length >= 8) return rows;
      }
    }
    // Bots with no declared commands still do things — offer to mention them.
    for (const bot of commandBots) {
      if (!bot.enabled || bot.commands.length > 0) continue;
      if (!q || bot.name.toLowerCase().includes(q) || bot.username.toLowerCase().includes(q)) {
        rows.push({ key: `t:${bot.id}`, type: "talk", bot });
      }
      if (rows.length >= 8) break;
    }
    return rows;
  };

  const acceptRow = (row: MenuRow) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    let next = value;
    let nextCaret = caret;
    if (row.type === "mention" && menu?.kind === "mention") {
      next = value.slice(0, menu.at) + `@${row.user.username} ` + value.slice(caret);
      nextCaret = menu.at + row.user.username.length + 2;
    } else if (row.type !== "mention" && menu?.kind === "command") {
      const insert = row.type === "command" ? `/${row.name} ` : `@${row.bot.username} `;
      next = insert + value.slice(caret);
      nextCaret = insert.length;
    } else {
      return;
    }
    setValue(next.slice(0, MAX_LEN + 50));
    setMenu(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
      el.selectionStart = el.selectionEnd = Math.min(nextCaret, el.value.length);
    });
  };

  // Keep the highlighted row visible while arrow-keying through the menu.
  useEffect(() => {
    if (!menu) return;
    document.getElementById(`ac-row-${menu.index}`)?.scrollIntoView({ block: "nearest" });
  }, [menu]);

  useEffect(() => {
    if (editing) {
      setValue(editing.content);
      ref.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  const insertText = (text: string) => {
    const el = ref.current;
    if (!el) {
      setValue((v) => v + text);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next.slice(0, MAX_LEN + 50));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  };

  const submit = () => {
    const clean = value.trim().slice(0, MAX_LEN);
    if ((!clean && pending.length === 0) || uploading) return;
    // No "(attachment)" placeholder — empty text + attachments is valid.
    // Old "(attachment)"/"(image)" messages are hidden by MessageItem instead.
    onSend(clean, [...pending]);
    setValue("");
    setPending([]);
    setUploadError("");
    setShowEmoji(false);
    setShowGifs(false);
    setMenu(null);
    if (ref.current) ref.current.style.height = "auto";
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const user = useAuthStore.getState().user;
    if (!user) {
      setUploadError("Log in to upload files");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      const supabase = createClient();
      const next: ChatAttachment[] = [];
      for (const file of Array.from(files).slice(0, 5 - pending.length)) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          setUploadError(`${file.name}: images, GIFs and audio only`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          setUploadError(`${file.name}: max 8 MB`);
          continue;
        }
        const path = `${user.id}/${Date.now()}-${safeName(file.name)}`;
        const { error } = await supabase.storage.from("chat-uploads").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) {
          setUploadError(`Upload failed: ${error.message}`);
          continue;
        }
        const { data } = supabase.storage.from("chat-uploads").getPublicUrl(path);
        next.push({ url: data.publicUrl, name: file.name.slice(0, 128), mime: file.type });
      }
      setPending((p) => [...p, ...next].slice(0, 5));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const pickGif = (gif: PickedGif) => {
    setPending((p) => [...p, { url: gif.url, name: gif.title.slice(0, 128), mime: "image/gif" }].slice(0, 5));
    setShowGifs(false);
  };

  const currentEmojis = serverDetail?.customEmojis ?? [];
  const allowExternal = serverDetail?.allowExternalEmoji ?? true;
  const external = myEmojis.filter((e) => !currentEmojis.some((c) => c.name === e.name));

  const rows = menuRows();
  const activeRow = menu && rows.length > 0 ? rows[Math.min(menu.index, rows.length - 1)] : null;

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete menu takes over navigation keys while open.
    if (menu && rows.length > 0 && activeRow) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index + 1) % rows.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index - 1 + rows.length) % rows.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptRow(activeRow);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    } else if (e.key === "Escape" && menu) {
      e.preventDefault();
      setMenu(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && enterToSend) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && editing) {
      onCancelEdit();
      setValue("");
    }
  };

  return (
    <div className="relative px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      {replyTo && (
        <div className="mb-1.5 flex items-center justify-between rounded-2xl rounded-b-md border border-white/[0.06] bg-white/[0.04] px-3.5 py-2 text-xs text-speakit-muted backdrop-blur">
          <span className="truncate">Replying to <b className="text-white">{replyTo.author.displayName}</b> · {previewForMessage(replyTo.content, replyTo.attachments).slice(0, 80) || "attachment"}</span>
          <button onClick={onCancelReply} className="ml-2 rounded-full p-1 transition hover:bg-white/10 hover:text-white"><X size={14} /></button>
        </div>
      )}
      {editing && (
        <div className="mb-1.5 flex items-center justify-between rounded-2xl rounded-b-md border border-speakit-blurple/30 bg-speakit-blurple/10 px-3.5 py-2 text-xs text-speakit-text">
          <span>Editing message · <span className="text-speakit-muted">Esc to cancel, Enter to save</span></span>
          <button onClick={onCancelEdit} className="ml-2 rounded-full p-1 transition hover:bg-white/10 hover:text-white"><X size={14} /></button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-2 rounded-2xl rounded-b-md border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
          {pending.map((a) => (
            <div key={a.url} className="relative">
              {a.mime.startsWith("audio/") ? (
                <div className="flex h-16 w-40 items-center rounded-xl bg-black/40 px-2 text-[11px] text-white ring-1 ring-white/10">🎵 {a.name.slice(0, 18)}</div>
              ) : (
                <img src={a.url} alt={a.name} className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10" />
              )}
              <button
                onClick={() => setPending((p) => p.filter((x) => x.url !== a.url))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-1 text-white ring-1 ring-white/20 transition hover:bg-rose-500 hover:text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {uploadError && <div className="mb-1.5 rounded-xl bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 ring-1 ring-rose-500/25">{uploadError}</div>}
      <div className="flex items-end gap-1 rounded-2xl border border-white/10 bg-speakit-input/90 px-2 py-2 shadow-card backdrop-blur transition focus-within:border-speakit-blurple/50 focus-within:shadow-glow focus-within:ring-2 focus-within:ring-speakit-blurple/20">
        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => void pickFiles(e.target.files)} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || pending.length >= 5}
          title="Upload image, GIF or audio"
          className="rounded-full p-2 text-speakit-muted transition hover:bg-speakit-blurple/20 hover:text-white disabled:opacity-40"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        </button>
        <button
          onClick={() => { setShowEmoji((v) => !v); setShowGifs(false); }}
          title="Emoji"
          className={`rounded-full p-2 transition ${showEmoji ? "bg-amber-400/20 text-amber-300" : "text-speakit-muted hover:bg-white/10 hover:text-amber-300"}`}
        >
          <Smile size={18} />
        </button>
        <button
          onClick={() => { setShowGifs((v) => !v); setShowEmoji(false); }}
          title="GIFs"
          className={`rounded-full p-2 transition ${showGifs ? "bg-speakit-blurple/25 text-white" : "text-speakit-muted hover:bg-white/10 hover:text-white"}`}
        >
          <Gift size={18} />
        </button>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            refreshMenu(next, e.target.selectionStart ?? next.length);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
          }}
          onSelect={(e) => {
            const el = e.target as HTMLTextAreaElement;
            refreshMenu(el.value, el.selectionStart ?? el.value.length);
          }}
          onKeyDown={onTextareaKeyDown}
          rows={1}
          maxLength={MAX_LEN + 50}
          placeholder={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent text-[15px] text-white outline-none placeholder:text-speakit-muted"
        />
        <span className={`pb-1 text-[10px] font-semibold tabular-nums ${value.length > MAX_LEN ? "text-rose-400" : "text-speakit-muted/60"}`}>
          {value.length > MAX_LEN - 100 ? `${Math.min(value.length, MAX_LEN + 50)}/${MAX_LEN}` : ""}
        </span>
        <button onClick={submit} disabled={(!value.trim() && pending.length === 0) || uploading} className="brand-gradient rounded-full p-2.5 text-white shadow-glow transition hover:brightness-110 active:scale-95 disabled:bg-none disabled:bg-white/10 disabled:text-speakit-muted disabled:shadow-none disabled:opacity-40">
          <Send size={16} />
        </button>
      </div>
      {menu && rows.length > 0 && (
        <div className="menu-pop absolute bottom-full left-2 right-2 z-20 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-speakit-card/95 shadow-pop backdrop-blur-xl sm:left-4 sm:w-80 sm:right-auto">
          <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-speakit-muted">
            {menu.kind === "mention" ? "Mention — pick someone to ping" : "Bot commands — type to filter"}
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {rows.map((row, i) => (
              <button
                key={row.key}
                id={`ac-row-${i}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => acceptRow(row)}
                onMouseEnter={() => setMenu({ ...menu, index: i })}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
                  activeRow?.key === row.key ? "bg-speakit-blurple/60" : "hover:bg-white/5"
                }`}
              >
                {row.type === "mention" && (
                  <>
                    <Avatar name={row.user.displayName} color={row.user.avatarColor} src={row.user.avatarUrl || undefined} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-semibold text-white">
                        <span className="truncate">{row.user.displayName}</span>
                        {row.user.isBot && <BotTag />}
                      </span>
                      <span className="block truncate text-[11px] text-speakit-muted">@{row.user.username}</span>
                    </span>
                  </>
                )}
                {row.type === "command" && (
                  <>
                    <Avatar name={row.bot.name} color={row.bot.avatarColor} src={row.bot.avatarUrl || undefined} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="truncate text-sm font-semibold text-white">
                        <span className="text-[#b5bdff]">/{row.name}</span>
                      </span>
                      <span className="block truncate text-[11px] text-speakit-muted">
                        {row.description || `Run ${row.name}`} · {row.bot.name}
                      </span>
                    </span>
                    <BotTag />
                  </>
                )}
                {row.type === "talk" && (
                  <>
                    <Avatar name={row.bot.name} color={row.bot.avatarColor} src={row.bot.avatarUrl || undefined} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-semibold text-white">
                        <span className="truncate">{row.bot.name}</span>
                        <BotTag />
                      </span>
                      <span className="block truncate text-[11px] text-speakit-muted">No commands — mention to talk to it</span>
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-speakit-muted">
            ↑↓ to move · Enter to pick · Esc to dismiss
          </div>
        </div>
      )}
      {showEmoji && (
        <div className="absolute bottom-full left-4 z-20 mb-1">
          <EmojiPicker
            serverEmojis={currentEmojis}
            externalEmojis={external}
            allowExternal={allowExternal}
            onPick={(t) => {
              insertText(t);
              setShowEmoji(false);
            }}
          />
        </div>
      )}
      {showGifs && (
        <div className="absolute bottom-full left-4 z-20 mb-1">
          <GifPicker onPick={pickGif} />
        </div>
      )}
    </div>
  );
}
