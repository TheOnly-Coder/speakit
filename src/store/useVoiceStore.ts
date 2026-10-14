import { create } from "zustand";

export type VoicePeer = {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
};

type VoiceState = {
  channelId: string | null;
  serverId: string | null;
  peers: VoicePeer[];
  selfMuted: boolean;
  selfDeafened: boolean;
  joining: boolean;
  setChannel: (channelId: string | null, serverId: string | null) => void;
  setPeers: (peers: VoicePeer[]) => void;
  upsertPeer: (peer: VoicePeer) => void;
  removePeer: (userId: string) => void;
  updatePeerState: (userId: string, patch: Partial<VoicePeer>) => void;
  setSelfMuted: (v: boolean) => void;
  setSelfDeafened: (v: boolean) => void;
  setJoining: (v: boolean) => void;
  reset: () => void;
};

export const useVoiceStore = create<VoiceState>((set) => ({
  channelId: null,
  serverId: null,
  peers: [],
  selfMuted: false,
  selfDeafened: false,
  joining: false,
  setChannel: (channelId, serverId) => set({ channelId, serverId }),
  setPeers: (peers) => set({ peers }),
  upsertPeer: (peer) =>
    set((s) => {
      const exists = s.peers.some((p) => p.userId === peer.userId);
      if (!exists) return { peers: [...s.peers, peer] };
      return { peers: s.peers.map((p) => (p.userId === peer.userId ? { ...p, ...peer } : p)) };
    }),
  removePeer: (userId) => set((s) => ({ peers: s.peers.filter((p) => p.userId !== userId) })),
  updatePeerState: (userId, patch) =>
    set((s) => ({ peers: s.peers.map((p) => (p.userId === userId ? { ...p, ...patch } : p)) })),
  setSelfMuted: (v) => set({ selfMuted: v }),
  setSelfDeafened: (v) => set({ selfDeafened: v }),
  setJoining: (v) => set({ joining: v }),
  reset: () => set({ channelId: null, serverId: null, peers: [], selfMuted: false, selfDeafened: false, joining: false }),
}));
