"use client";

import { Users, Plus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewForMessage } from "@/lib/messagePreview";
import { useAppStore } from "@/store/useAppStore";
import { useProfileStore } from "@/store/useProfileStore";
import { Avatar } from "./Avatar";
import { UserArea } from "./UserArea";
import { ctxProps } from "./ContextMenu";

/**
 * Discord-mobile-style DM list: "Direct Messages" header, Friends pill,
 * DM rows, requests, and the user bar pinned at the bottom.
 */
export function DMSidebar({
  onAddFriend,
  onOpenSettings,
  onShowFriends,
  onNewDM,
}: {
  onAddFriend: () => void;
  onOpenSettings: () => void;
  onShowFriends: () => void;
  onNewDM: () => void;
}) {
  const { conversations, activeDMId, setActiveDM, dmMentionCounts, toggleMute, markMentionsRead, pendingIn } = useAppStore();

  return (
    <div className="flex w-[var(--speakit-sidebar-w)] max-w-[calc(92vw-var(--speakit-rail-w))] shrink-0 flex-col bg-speakit-sidebar">
      <div className="flex h-12 shrink-0 items-center border-b border-black/30 px-4">
        <span className="truncate text-sm font-bold text-white">Direct Messages</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* Friends pill — like Discord mobile's top shortcut */}
        <button
          onClick={onShowFriends}
          className="mb-1 flex w-full items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-left hover:bg-white/15"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-speakit-muted">
            <Users size={16} />
          </span>
          <span className="text-sm font-semibold text-white">Friends</span>
          {pendingIn.length > 0 && (
            <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingIn.length}
            </span>
          )}
        </button>

        <div className="mb-1 mt-3 flex items-center justify-between px-2">
          <span className="text-[11px] font-bold uppercase text-speakit-muted">Direct Messages</span>
          <button onClick={onNewDM} title="New message" className="rounded p-0.5 text-speakit-muted hover:text-white">
            <Plus size={15} />
          </button>
        </div>

        {conversations.length === 0 && (
          <button onClick={onNewDM} className="w-full rounded-lg px-3 py-3 text-left text-xs text-speakit-muted hover:bg-white/5">
            No messages yet — tap + to start one.
          </button>
        )}
        {conversations.map((c) => {
          const pings = dmMentionCounts[c.id] ?? 0;
          return (
            <div
              key={c.id}
              className={cn(
                "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5",
                activeDMId === c.id && "bg-white/10"
              )}
              {...ctxProps(() => [
                { type: "header" as const, label: c.other.displayName },
                { type: "item" as const, label: "View Profile", onClick: () => useProfileStore.getState().openProfile(c.other.id) },
                { type: "sep" as const },
                { type: "item" as const, label: "Close Conversation", danger: true, onClick: () => void closeDM(c.id) },
              ])}
            >
              <button
                onClick={() => {
                  setActiveDM(c.id);
                  if (pings > 0) void markMentionsRead({ conversationId: c.id });
                }}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar name={c.other.displayName} color={c.other.avatarColor} src={c.other.avatarUrl || undefined} size={36} status={c.other.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{c.other.displayName}</div>
                  <div className="truncate text-[11px] text-speakit-muted">{previewForMessage(c.lastMessage, c.attachments ?? []) || "Start a conversation"}</div>
                </div>
                {pings > 0 && <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">@{pings}</span>}
              </button>
              <button
                title="Close conversation"
                onClick={() => void closeDM(c.id)}
                className="hidden shrink-0 rounded p-1 text-xs text-speakit-muted hover:text-red-400 group-hover:block"
              >
                ✕
              </button>
            </div>
          );
        })}

        {pendingIn.length > 0 && (
          <>
            <div className="mb-1 mt-3 px-2 text-[11px] font-bold uppercase text-speakit-muted">
              Friend Requests — {pendingIn.length}
            </div>
            {pendingIn.map((p) => (
              <PendingRow key={p.id} id={p.id} username={p.user.username} displayName={p.user.displayName} color={p.user.avatarColor} avatarUrl={p.user.avatarUrl} />
            ))}
          </>
        )}

        <button onClick={onAddFriend} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-speakit-green hover:bg-white/5">
          <UserPlus size={14} /> Add Friend
        </button>
      </div>

      <UserArea
        onOpenSettings={onOpenSettings}
        onLogout={() => window.dispatchEvent(new CustomEvent("speakit:logout"))}
      />
    </div>
  );
}

async function closeDM(conversationId: string) {
  if (!confirm("Close this conversation? (Messages are deleted)")) return;
  await fetch(`/api/dms/${conversationId}`, { method: "DELETE" });
  const st = useAppStore.getState();
  if (st.activeDMId === conversationId) st.setActiveDM(null);
  await st.refreshDMs();
}

function PendingRow({ id, username, displayName, color, avatarUrl }: { id: string; username: string; displayName: string; color: string; avatarUrl?: string }) {
  const act = async (action: string) => {
    const res = await fetch(`/api/friends/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => ({}));
    try {
      const { getSocket } = await import("@/lib/socket");
      if (data.otherUserId) getSocket().emit("friend:refresh", { userIds: [data.otherUserId] });
    } catch {
      /* ignore */
    }
    await useAppStore.getState().refreshFriends();
    await useAppStore.getState().refreshDMs();
  };
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
      <Avatar name={displayName} color={color} src={avatarUrl || undefined} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{displayName}</div>
        <div className="truncate text-[11px] text-speakit-muted">@{username}</div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button onClick={() => void act("accept")} className="rounded bg-speakit-green px-2 py-1 text-[11px] font-semibold text-white">Accept</button>
        <button onClick={() => void act("decline")} className="rounded bg-white/10 px-2 py-1 text-[11px] text-white">Decline</button>
      </div>
    </div>
  );
}
