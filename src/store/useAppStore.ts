import { create } from "zustand";

export type ServerListItem = {
  id: string;
  name: string;
  iconColor: string;
  iconUrl: string;
  bannerUrl?: string;
  description?: string;
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
  categoryId: string | null;
  position: number;
};

export type CategoryItem = {
  id: string;
  name: string;
  position: number;
};

export type RoleItem = {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: string[];
  memberCount: number;
};

export type BanItem = {
  id: string;
  userId: string;
  reason: string;
  username: string;
  displayName: string;
};

export type ServerEmoji = {
  id: string;
  serverId: string;
  name: string;
  url: string;
  animated: boolean;
};

export type MemberItem = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  status: string;
  role: string;
  roleIds: string[];
  roleNames: string[];
};

export type ServerDetail = {
  id: string;
  name: string;
  iconColor: string;
  iconUrl: string;
  bannerUrl?: string;
  description?: string;
  tags?: string;
  inviteCode: string;
  discoverable: boolean;
  allowExternalEmoji: boolean;
  ownerId: string;
  channels: ChannelItem[];
  categories: CategoryItem[];
  roles: RoleItem[];
  bans: BanItem[];
  customEmojis: ServerEmoji[];
  members: MemberItem[];
};

export type FriendUser = {
  id: string;
  friendshipId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  status: string;
};

export type GifFavorite = {
  id: string;
  url: string;
  preview: string;
};

export type DMConversation = {
  id: string;
  other: FriendUser;
  lastMessage: string;
  attachments?: { url: string; name: string; mime: string }[];
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
  myEmojis: ServerEmoji[];
  mutedChannels: string[];
  mutedDMs: string[];
  mentionCounts: Record<string, number>;
  dmMentionCounts: Record<string, number>;
  totalMentions: number;
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
  refreshMyEmojis: () => Promise<void>;
  refreshMutes: () => Promise<void>;
  refreshMentions: () => Promise<void>;
  toggleMute: (kind: "channel" | "dm", targetId: string) => Promise<boolean>;
  markMentionsRead: (key: { channelId?: string; conversationId?: string }) => Promise<void>;
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
  myEmojis: [],
  mutedChannels: [],
  mutedDMs: [],
  mentionCounts: {},
  dmMentionCounts: {},
  totalMentions: 0,
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
  refreshMyEmojis: async () => {
    try {
      const res = await fetch("/api/emojis/mine", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) set({ myEmojis: data.emojis ?? [] });
    } catch { /* ignore */ }
  },
  refreshMutes: async () => {
    try {
      const res = await fetch("/api/mutes", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) set({ mutedChannels: data.channels ?? [], mutedDMs: data.dms ?? [] });
    } catch { /* ignore */ }
  },
  refreshMentions: async () => {
    try {
      const res = await fetch("/api/mentions", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) set({ mentionCounts: data.byChannel ?? {}, dmMentionCounts: data.byDm ?? {}, totalMentions: data.total ?? 0 });
    } catch { /* ignore */ }
  },
  toggleMute: async (kind, targetId) => {
    try {
      const res = await fetch("/api/mutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId }),
      });
      const data = await res.json();
      if (!res.ok) return kind === "channel" ? get().mutedChannels.includes(targetId) : get().mutedDMs.includes(targetId);
      await get().refreshMutes();
      await get().refreshMentions();
      return !!data.muted;
    } catch {
      return false;
    }
  },
  markMentionsRead: async (key) => {
    try {
      await fetch("/api/mentions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key),
      });
      await get().refreshMentions();
    } catch { /* ignore */ }
  },
}));
