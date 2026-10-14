"use client";

import { Pin } from "lucide-react";
import { Modal } from "./ui";
import { Avatar } from "./Avatar";
import { formatTime } from "@/lib/utils";
import { previewForMessage, shouldShowBody } from "@/lib/messagePreview";

export type PinItem = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; username: string; displayName: string; avatarColor: string; avatarUrl?: string };
  attachments: { url: string; name: string; mime: string }[];
};

export function PinsModal({
  open,
  onClose,
  pins,
  channelName,
  onJump,
  onUnpin,
}: {
  open: boolean;
  onClose: () => void;
  pins: PinItem[];
  channelName: string;
  onJump: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Pinned in #${channelName}`}>
      {pins.length === 0 && <div className="py-4 text-center text-sm text-speakit-muted">No pinned messages yet.</div>}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {pins.map((p) => (
          <div key={p.id} className="rounded-lg bg-speakit-input p-3">
            <div className="mb-1 flex items-center gap-2">
              <Avatar name={p.author.displayName} color={p.author.avatarColor} src={p.author.avatarUrl || undefined} size={24} />
              <span className="text-xs font-semibold text-white">{p.author.displayName}</span>
              <span className="text-[11px] text-speakit-muted">{formatTime(p.createdAt)}</span>
              <span className="ml-auto flex gap-1">
                <button onClick={() => onJump(p.id)} className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white hover:bg-white/20">Jump</button>
                <button onClick={() => onUnpin(p.id)} className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white hover:bg-white/20">Unpin</button>
              </span>
            </div>
            {shouldShowBody(p.content) ? (
              <div className="whitespace-pre-wrap break-words text-sm">{p.content}</div>
            ) : p.attachments.length > 0 ? (
              <div className="text-sm italic text-speakit-muted">{previewForMessage(p.content, p.attachments)}</div>
            ) : null}
            {p.attachments.length > 0 && (
              <div className="mt-1 flex gap-1">
                {p.attachments.map((a) => (
                  <img key={a.url} src={a.url} alt={a.name} className="h-14 w-14 rounded object-cover" loading="lazy" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function PinCount({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} title="Pinned messages" className="flex items-center gap-1 rounded p-1.5 text-speakit-muted hover:text-white">
      <Pin size={18} />
      {count > 0 && <span className="text-xs font-bold">{count}</span>}
    </button>
  );
}
