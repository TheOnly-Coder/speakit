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

export function MessageInput({
  placeholder,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
}: {
  placeholder: string;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (content: string, attachments: ChatAttachment[]) => void;
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

  return (
    <div className="relative px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      {replyTo && (
        <div className="mb-1 flex items-center justify-between rounded-t-lg bg-[#2b2d31] px-3 py-1.5 text-xs text-speakit-muted">
          <span>Replying to <b className="text-white">{replyTo.author.displayName}</b>: {previewForMessage(replyTo.content, replyTo.attachments).slice(0, 80) || "attachment"}</span>
          <button onClick={onCancelReply}><X size={14} /></button>
        </div>
      )}
      {editing && (
        <div className="mb-1 flex items-center justify-between rounded-t-lg bg-[#2b2d31] px-3 py-1.5 text-xs text-speakit-muted">
          <span>Editing message (Esc to cancel, Enter to save)</span>
          <button onClick={onCancelEdit}><X size={14} /></button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-2 rounded-t-lg bg-[#2b2d31] px-3 py-2">
          {pending.map((a) => (
            <div key={a.url} className="relative">
              {a.mime.startsWith("audio/") ? (
                <div className="flex h-16 w-40 items-center rounded-md bg-black/40 px-2 text-[11px] text-white">🎵 {a.name.slice(0, 18)}</div>
              ) : (
                <img src={a.url} alt={a.name} className="h-16 w-16 rounded-md object-cover" />
              )}
              <button
                onClick={() => setPending((p) => p.filter((x) => x.url !== a.url))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-0.5 text-white hover:text-red-400"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {uploadError && <div className="mb-1 px-1 text-xs text-red-400">{uploadError}</div>}
      <div className="flex items-end gap-1.5 rounded-lg bg-speakit-input px-2 py-2">
        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => void pickFiles(e.target.files)} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || pending.length >= 5}
          title="Upload image, GIF or audio"
          className="rounded-full bg-white/5 p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        </button>
        <button
          onClick={() => { setShowEmoji((v) => !v); setShowGifs(false); }}
          title="Emoji"
          className="rounded-full p-1.5 text-speakit-muted hover:bg-white/10 hover:text-yellow-400"
        >
          <Smile size={18} />
        </button>
        <button
          onClick={() => { setShowGifs((v) => !v); setShowEmoji(false); }}
          title="GIFs"
          className="rounded-full p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white"
        >
          <Gift size={18} />
        </button>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && enterToSend) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && editing) {
              onCancelEdit();
              setValue("");
            }
          }}
          rows={1}
          maxLength={MAX_LEN + 50}
          placeholder={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent text-[15px] text-white outline-none placeholder:text-speakit-muted"
        />
        <span className={`pb-1 text-[10px] ${value.length > MAX_LEN ? "text-red-400" : "text-speakit-muted"}`}>
          {value.length > MAX_LEN - 100 ? `${Math.min(value.length, MAX_LEN + 50)}/${MAX_LEN}` : ""}
        </span>
        <button onClick={submit} disabled={(!value.trim() && pending.length === 0) || uploading} className="rounded p-1.5 text-speakit-muted hover:text-white disabled:opacity-40">
          <Send size={18} />
        </button>
      </div>
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
