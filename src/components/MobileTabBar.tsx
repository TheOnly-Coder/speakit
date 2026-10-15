"use client";

import { Home, Users, Search, Bell } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils";

export type MobileTab = "chats" | "friends";

/**
 * Discord-mobile-style bottom navigation. Phones only (sm:hidden):
 * Chats · Friends · Search · Inbox · You.
 */
export function MobileTabBar({
  tab,
  onChats,
  onFriends,
  onSearch,
  onInbox,
  onYou,
}: {
  tab: MobileTab;
  onChats: () => void;
  onFriends: () => void;
  onSearch: () => void;
  onInbox: () => void;
  onYou: () => void;
}) {
  const { pendingIn, totalMentions } = useAppStore();
  const { user } = useAuthStore();
  const inboxCount = totalMentions + pendingIn.length;

  const item = (active: boolean) =>
    cn(
      "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5",
      active ? "text-white" : "text-speakit-muted"
    );

  return (
    <nav className="shrink-0 border-t border-white/[0.06] bg-speakit-rail/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl sm:hidden">
      <div className="flex">
        <button onClick={onChats} className={item(tab === "chats")} title="Chats">
          <Home size={22} />
          <span className="text-[10px] font-bold">Home</span>
          {tab === "chats" && <span className="absolute -top-[5px] h-1 w-8 rounded-full bg-gradient-to-r from-speakit-blurple to-speakit-accent" />}
        </button>
        <button onClick={onFriends} className={item(tab === "friends")} title="Friends">
          <span className="relative">
            <Users size={22} />
            {pendingIn.length > 0 && (
              <span className="absolute -right-2 -top-1.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-1 text-[9px] font-bold text-white">
                {pendingIn.length}
              </span>
            )}
          </span>
          <span className="text-[10px] font-bold">Friends</span>
          {tab === "friends" && <span className="absolute -top-[5px] h-1 w-8 rounded-full bg-gradient-to-r from-speakit-blurple to-speakit-accent" />}
        </button>
        <button onClick={onSearch} className={item(false)} title="Search (Ctrl+K)">
          <Search size={22} />
          <span className="text-[10px] font-bold">Search</span>
        </button>
        <button onClick={onInbox} className={item(false)} title="Inbox — mentions & requests">
          <span className="relative">
            <Bell size={22} />
            {inboxCount > 0 && (
              <span className="absolute -right-2 -top-1.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-1 text-[9px] font-bold text-white">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}
          </span>
          <span className="text-[10px] font-bold">Inbox</span>
        </button>
        <button onClick={onYou} className={item(false)} title="You — settings">
          {user ? (
            <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl || undefined} size={24} status={user.status} />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">?</span>
          )}
          <span className="text-[10px] font-semibold">You</span>
        </button>
      </div>
    </nav>
  );
}
