"use client";

import { useEffect, useState } from "react";
import { AtSign, Hash, User, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { Avatar } from "./Avatar";

export type InboxItem = {
  id: string;
  kind: "channel" | "dm";
  channelId?: string;
  channelName?: string;
  serverId?: string;
  serverName?: string;
  conversationId?: string;
  dmName?: string;
  authorName?: string;
  preview?: string;
  createdAt?: string;
};

/**
 * Discord-mobile-style Inbox bottom sheet: unread @mentions with jump
 * buttons, plus pending friend requests.
 */
export function MobileInbox({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pendingIn, refreshFriends, refreshDMs, refreshMentions, setActiveServer, setActiveChannel, setActiveDM, markMentionsRead, conversations } =
    useAppStore();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/mentions", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.items)) setItems(data.items);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open ]);

  if (!open) return null;

  const jump = async (it: InboxItem) => {
    if (it.kind === "dm" && it.conversationId) {
      setActiveServer(null);
      setActiveDM(it.conversationId);
      await markMentionsRead({ conversationId: it.conversationId });
    } else if (it.kind === "channel" && it.channelId && it.serverId) {
      setActiveServer(it.serverId);
      await useAppStore.getState().refreshServerDetail(it.serverId);
      setActiveChannel(it.channelId);
      await markMentionsRead({ channelId: it.channelId });
    }
    onClose();
  };

  const actRequest = async (id: string, action: string, otherUserId?: string) => {
    const res = await fetch(`/api/friends/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    try {
      const { getSocket } = await import("@/lib/socket");
      if (data.otherUserId || otherUserId) getSocket().emit("friend:refresh", { userIds: [data.otherUserId ?? otherUserId] });
    } catch {
      /* ignore */
    }
    await refreshFriends();
    await refreshDMs();
    await refreshMentions();
  };

  return (
    <div className="fixed inset-0 z-[75] sm:hidden">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="sheet-up absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-2xl bg-speakit-sidebar shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm font-bold text-white">Inbox</span>
          <button onClick={onClose} className="rounded-full p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white" title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="px-1 pb-1 text-[11px] font-bold uppercase text-speakit-muted">Mentions</div>
          {loading && <div className="px-1 py-2 text-xs text-speakit-muted">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="rounded-lg bg-black/20 px-3 py-3 text-xs text-speakit-muted">You&apos;re all caught up — no unread mentions.</div>
          )}
          {items.map((it) => {
            const convo = it.kind === "dm" ? conversations.find((c) => c.id === it.conversationId) : undefined;
            return (
              <button key={it.id} onClick={() => void jump(it)} className="mb-1 flex w-full items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5 text-left active:bg-white/10">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-speakit-blurple/20 text-speakit-blurple">
                  {it.kind === "dm" ? (
                    convo ? (
                      <Avatar name={convo.other.displayName} color={convo.other.avatarColor} src={convo.other.avatarUrl || undefined} size={36} />
                    ) : (
                      <User size={16} />
                    )
                  ) : (
                    <Hash size={16} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-white">
                    <AtSign size={11} className="mr-0.5 inline text-speakit-muted" />
                    {it.kind === "dm" ? it.dmName : `#${it.channelName}`}
                    <span className="ml-1 font-normal text-speakit-muted">{it.kind === "dm" ? "" : `· ${it.serverName}`}</span>
                  </span>
                  <span className="block truncate text-xs text-speakit-muted">
                    {it.authorName}: {it.preview}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-bold text-speakit-blurple">Jump</span>
              </button>
            );
          })}

          <div className="px-1 pb-1 pt-3 text-[11px] font-bold uppercase text-speakit-muted">
            Friend Requests {pendingIn.length > 0 ? `— ${pendingIn.length}` : ""}
          </div>
          {pendingIn.length === 0 && (
            <div className="rounded-lg bg-black/20 px-3 py-3 text-xs text-speakit-muted">No pending requests.</div>
          )}
          {pendingIn.map((p) => (
            <div key={p.id} className="mb-1 flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
              <Avatar name={p.user.displayName} color={p.user.avatarColor} src={p.user.avatarUrl || undefined} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white">{p.user.displayName}</div>
                <div className="truncate text-xs text-speakit-muted">@{p.user.username}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => void actRequest(p.id, "accept")} className="rounded bg-speakit-green px-2.5 py-1 text-[11px] font-semibold text-white">Accept</button>
                <button onClick={() => void actRequest(p.id, "decline")} className="rounded bg-white/10 px-2.5 py-1 text-[11px] text-white">Decline</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
