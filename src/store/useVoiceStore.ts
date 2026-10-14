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
  sharingSelf: boolean;
  screenStreams: Record<string, MediaStream>;
  selfScreen: MediaStream | null;
  connectedAt: number | null;
  /** Last join failure, shown in the voice UI so users know what happened. */
  joinError: string | null;
  /** True when we joined listen-only because the mic was blocked/unavailable. */
  micBlocked: boolean;
  /** Per-peer WebRTC connection state (connecting/connected/failed). */
  peerConn: Record<string, string>;
  setChannel: (channelId: string | null, serverId: string | null) => void;
  setPeers: (peers: VoicePeer[]) => void;
  upsertPeer: (peer: VoicePeer) => void;
  removePeer: (userId: string) => void;
  updatePeerState: (userId: string, patch: Partial<VoicePeer>) => void;
  setSelfMuted: (v: boolean) => void;
  setSelfDeafened: (v: boolean) => void;
  setJoining: (v: boolean) => void;
  setSharingSelf: (v: boolean) => void;
  setScreenStream: (userId: string, stream: MediaStream | null) => void;
  setSelfScreen: (stream: MediaStream | null) => void;
  setConnectedAt: (v: number | null) => void;
  setJoinError: (v: string | null) => void;
  setMicBlocked: (v: boolean) => void;
  setPeerConn: (userId: string, state: string | null) => void;
  reset: () => void;
};

export const useVoiceStore = create<VoiceState>((set) => ({
  channelId: null,
  serverId: null,
  peers: [],
  selfMuted: false,
  selfDeafened: false,
  joining: false,
  sharingSelf: false,
  screenStreams: {},
  selfScreen: null,
  connectedAt: null,
  joinError: null,
  micBlocked: false,
  peerConn: {},
  setChannel: (channelId, serverId) => set({ channelId, serverId }),
  setPeers: (peers) => set({ peers }),
  upsertPeer: (peer) =>
    set((s) => {
      const exists = s.peers.some((p) => p.userId === peer.userId);
      if (!exists) return { peers: [...s.peers, peer] };
      return { peers: s.peers.map((p) => (p.userId === peer.userId ? { ...p, ...peer } : p)) };
    }),
  removePeer: (userId) =>
    set((s) => {
      const peerConn = { ...s.peerConn };
      delete peerConn[userId];
      return { peers: s.peers.filter((p) => p.userId !== userId), peerConn };
    }),
  updatePeerState: (userId, patch) =>
    set((s) => ({ peers: s.peers.map((p) => (p.userId === userId ? { ...p, ...patch } : p)) })),
  setSelfMuted: (v) => set({ selfMuted: v }),
  setSelfDeafened: (v) => set({ selfDeafened: v }),
  setJoining: (v) => set({ joining: v }),
  setSharingSelf: (v) => set({ sharingSelf: v }),
  setScreenStream: (userId, stream) =>
    set((s) => {
      const screenStreams = { ...s.screenStreams };
      if (stream) screenStreams[userId] = stream;
      else delete screenStreams[userId];
      return { screenStreams };
    }),
  setSelfScreen: (stream) => set({ selfScreen: stream }),
  setConnectedAt: (v) => set({ connectedAt: v }),
  setJoinError: (v) => set({ joinError: v }),
  setMicBlocked: (v) => set({ micBlocked: v }),
  setPeerConn: (userId, state) =>
    set((s) => {
      const peerConn = { ...s.peerConn };
      if (state) peerConn[userId] = state;
      else delete peerConn[userId];
      return { peerConn };
    }),
  reset: () => set({ channelId: null, serverId: null, peers: [], selfMuted: false, selfDeafened: false, joining: false, sharingSelf: false, screenStreams: {}, selfScreen: null, connectedAt: null, joinError: null, micBlocked: false, peerConn: {} }),
}));
