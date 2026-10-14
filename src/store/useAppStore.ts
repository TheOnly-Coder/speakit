import { create } from "zustand";

export type ServerListItem = {
  id: string;
  name: string;
  iconColor: string;
  inviteCode: string;
  ownerId: string;
  memberCount: number;
  role: string;
};

export type ChannelItem = {
  id: string;
  name: string;
  type: "TEXT" | "VOICE";
  topic: string;
  serverId: string;
  position: number;
};

export type MemberItem = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  status: string;
  role: string;
};

export type ServerDetail = {
  id: string;
  name: string;
  iconColor: string;
  inviteCode: string;
  ownerId: string;
  channels: ChannelItem[];
  members: MemberItem[];
};

export type FriendUser = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  status: string;
};

export type DMConversation = {
  id: string;
  other: FriendUser;
  lastMessage: string;
  lastAt: string;
};

type AppState = {
  view: "home" | "server";
  servers: ServerListItem[];
  activeServerId: string | null;
  serverDetail: ServerDetail | null;
  activeChannelId: string | null;
  activeDMId: string | null;
  friends: FriendUser[];
  pendingIn: { id: string; user: FriendUser }[];
  pendingOut: { id: string; user: FriendUser }[];
  conversations: DMConversation[];
  showMembers: boolean;
  loadingServers: boolean;

  setView: (v: "home" | "server") => void;
  setServers: (s: ServerListItem[]) => void;
  setActiveServer: (id: string | null) => void;
  setServerDetail: (d: ServerDetail | null) => void;
  setActiveChannel: (id: string | null) => void;
  setActiveDM: (id: string | null) => void;
  setShowMembers: (v: boolean) => void;
  refreshServers: () => Promise<void>;
  refreshServerDetail: (serverId: string) => Promise<void>;
  refreshFriends: () => Promise<void>;
  refreshDMs: () => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  view: "home",
  servers: [],
  activeServerId: null,
  serverDetail: null,
  activeChannelId: null,
  activeDMId: null,
  friends: [],
  pendingIn: [],
  pendingOut: [],
  conversations: [],
  showMembers: true,
  loadingServers: false,

  setView: (view) => set({ view }),
  setServers: (servers) => set({ servers }),
  setActiveServer: (id) => set({ activeServerId: id, view: id ? "server" : "home", serverDetail: id ? get().serverDetail : null }),
  setServerDetail: (serverDetail) => set({ serverDetail }),
  setActiveChannel: (id) => set({ activeChannelId: id }),
  setActiveDM: (id) => set({ activeDMId: id }),
  setShowMembers: (v) => set({ showMembers: v }),

  refreshServers: async () => {
    set({ loadingServers: true });
    try {
      const res = await fetch("/api/servers", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) set({ servers: data.servers ?? [] });
    } finally {
      set({ loadingServers: false });
    }
  },
  refreshServerDetail: async (serverId: string) => {
    try {
      const res = await fetch(`/api/servers/${serverId}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        set({ serverDetail: data.server });
        const current = get().activeChannelId;
        const channels: ChannelItem[] = data.server.channels ?? [];
        const stillExists = channels.some((c) => c.id === current);
        if (!current || !stillExists) {
          const firstText = channels.find((c) => c.type === "TEXT");
          set({ activeChannelId: firstText?.id ?? channels[0]?.id ?? null });
        }
      }
    } catch { /* ignore */ }
  },
  refreshFriends: async () => {
    try {
      const res = await fetch("/api/friends", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) set({ friends: data.friends ?? [], pendingIn: data.pendingIn ?? [], pendingOut: data.pendingOut ?? [] });
    } catch { /* ignore */ }
  },
  refreshDMs: async () => {
    try {
      const res = await fetch("/api/dms", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) set({ conversations: data.conversations ?? [] });
    } catch { /* ignore */ }
  },
}));
