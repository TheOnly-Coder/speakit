"use client";

import { useState } from "react";
import { UserPlus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";
import { Avatar } from "./Avatar";

export function DMSidebar({ onAddFriend, onOpenSettings }: { onAddFriend: () => void; onOpenSettings: () => void }) {
  const { friends, pendingIn, pendingOut, conversations, activeDMId, setActiveDM } = useAppStore();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<"all" | "pending">("all");

  return (
    <div className="flex w-60 flex-col bg-speakit-sidebar">
      <div className="flex h-12 items-center border-b border-black/30 px-4">
        <span className="text-sm font-bold text-white">Speakit Home</span>
      </div>
      <div className="flex gap-1 p-2">
        {(["all", "pending"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded px-2 py-1.5 text-xs font-semibold capitalize",
              tab === t ? "bg-white/10 text-white" : "text-speakit-muted hover:bg-white/5"
            )}
          >
            {t} {t === "pending" && pendingIn.length > 0 ? `(${pendingIn.length})` : ""}
          </button>
        ))}
        <button onClick={onAddFriend} title="Add friend" className="rounded px-2 text-speakit-green hover:bg-white/5">
          <UserPlus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {tab === "all" ? (
          <>
            <div className="px-2 py-1 text-[11px] font-bold uppercase text-speakit-muted">Friends — {friends.length}</div>
            {friends.length === 0 && <div className="px-2 text-xs text-speakit-muted">No friends yet. Add someone!</div>}
            {friends.map((f) => (
              <button key={f.id} onClick={() => useProfileStore.getState().openProfile(f.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5">
                <Avatar name={f.displayName} color={f.avatarColor} src={f.avatarUrl || undefined} size={32} status={f.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{f.displayName}</div>
                  <div className="truncate text-[11px] text-speakit-muted">@{f.username}</div>
                </div>
              </button>
            ))}
            <div className="px-2 py-1 pt-3 text-[11px] font-bold uppercase text-speakit-muted">Direct Messages</div>
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveDM(c.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5",
                  activeDMId === c.id && "bg-white/10"
                )}
              >
                <Avatar name={c.other.displayName} color={c.other.avatarColor} src={c.other.avatarUrl || undefined} size={32} status={c.other.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{c.other.displayName}</div>
                  <div className="truncate text-[11px] text-speakit-muted">{c.lastMessage || "Start a conversation"}</div>
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="px-2 py-1 text-[11px] font-bold uppercase text-speakit-muted">Incoming</div>
            {pendingIn.map((p) => (
              <PendingRow key={p.id} id={p.id} username={p.user.username} displayName={p.user.displayName} color={p.user.avatarColor} avatarUrl={p.user.avatarUrl} incoming />
            ))}
            <div className="px-2 py-1 pt-3 text-[11px] font-bold uppercase text-speakit-muted">Outgoing</div>
            {pendingOut.length === 0 && pendingIn.length === 0 && <div className="px-2 text-xs text-speakit-muted">No pending requests</div>}
            {pendingOut.map((p) => (
              <PendingRow key={p.id} id={p.id} username={p.user.username} displayName={p.user.displayName} color={p.user.avatarColor} avatarUrl={p.user.avatarUrl} incoming={false} />
            ))}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 bg-[#232428] px-2 py-2">
        {user && <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={32} status={user.status} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white">{user?.displayName}</div>
          <div className="truncate text-[11px] text-speakit-muted">@{user?.username}</div>
        </div>
        <button onClick={onOpenSettings} className="rounded p-1.5 text-speakit-muted hover:bg-white/10 hover:text-white">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}

function PendingRow({ id, username, displayName, color, avatarUrl, incoming }: { id: string; username: string; displayName: string; color: string; avatarUrl?: string; incoming: boolean }) {
  const refresh = async () => {
    await useAppStore.getState().refreshFriends();
    await useAppStore.getState().refreshDMs();
  };
  const act = async (action: string) => {
    await fetch(`/api/friends/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    await refresh();
  };
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
      <Avatar name={displayName} color={color} src={avatarUrl || undefined} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-white">{displayName}</div>
        <div className="truncate text-[11px] text-speakit-muted">@{username}</div>
      </div>
      {incoming ? (
        <div className="flex gap-1">
          <button onClick={() => void act("accept")} className="rounded bg-speakit-green px-2 py-1 text-[11px] text-white">Accept</button>
          <button onClick={() => void act("decline")} className="rounded bg-white/10 px-2 py-1 text-[11px] text-white">Decline</button>
        </div>
      ) : (
        <button onClick={() => void act("cancel")} className="rounded bg-white/10 px-2 py-1 text-[11px] text-white">Cancel</button>
      )}
    </div>
  );
}
