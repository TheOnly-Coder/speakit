"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, Plus, Loader2 } from "lucide-react";
import type { ChatMessage, ChatAttachment } from "@/store/useChatStore";
import { useAuthStore } from "@/store/useAuthStore";
import { createClient } from "@/lib/supabase";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/svg+xml"];

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "image";
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
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(editing.content);
      ref.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  const submit = () => {
    const clean = value.trim();
    if ((!clean && pending.length === 0) || uploading) return;
    onSend(clean || "(image)", [...pending]);
    setValue("");
    setPending([]);
    setUploadError("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const user = useAuthStore.getState().user;
    if (!user) {
      setUploadError("Log in to upload images");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      const supabase = createClient();
      const next: ChatAttachment[] = [];
      for (const file of Array.from(files).slice(0, 5 - pending.length)) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          setUploadError(`${file.name}: only PNG, JPG, GIF, WebP images`);
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

  return (
    <div className="px-4 pb-4">
      {replyTo && (
        <div className="mb-1 flex items-center justify-between rounded-t-lg bg-[#2b2d31] px-3 py-1.5 text-xs text-speakit-muted">
          <span>Replying to <b className="text-white">{replyTo.author.displayName}</b>: {replyTo.content.slice(0, 80)}</span>
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
              <img src={a.url} alt={a.name} className="h-16 w-16 rounded-md object-cover" />
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
      <div className="flex items-end gap-2 rounded-lg bg-speakit-input px-3 py-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml"
          multiple
          className="hidden"
          onChange={(e) => void pickFiles(e.target.files)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || pending.length >= 5}
          title="Upload image or GIF"
          className="rounded-full bg-white/5 p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && editing) {
              onCancelEdit();
              setValue("");
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent text-[15px] text-white outline-none placeholder:text-speakit-muted"
        />
        <button onClick={submit} disabled={(!value.trim() && pending.length === 0) || uploading} className="rounded p-1.5 text-speakit-muted hover:text-white disabled:opacity-40">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
