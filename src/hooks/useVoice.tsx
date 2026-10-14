"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useVoiceStore } from "@/store/useVoiceStore";
import { useAuthStore } from "@/store/useAuthStore";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

/**
 * Global voice actions. A single persistent `VoiceBridge` (mounted in HomePage)
 * owns the WebRTC connections, so voice keeps working while browsing channels.
 * Any UI can call `voiceActions.join(channelId, serverId)` / `voiceActions.leave()`.
 */
export const voiceActions: {
  join: (channelId: string, serverId: string) => Promise<void>;
  leave: () => void;
} = {
  join: async () => {
    console.warn("voice: bridge not mounted yet");
  },
  leave: () => {},
};

export function useVoice(channelId: string | null, serverId: string | null) {
  const { user } = useAuthStore();
  const { peers, setPeers, upsertPeer, removePeer, setChannel, selfMuted, selfDeafened, setJoining } = useVoiceStore();
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const localStream = useRef<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const channelRef = useRef<string | null>(null);
  const joinRef = useRef<(c: string, s: string) => Promise<void>>(async () => {});

  const cleanupPCs = useCallback(() => {
    pcs.current.forEach((pc) => {
      try {
        pc.close();
      } catch { /* ignore */ }
    });
    pcs.current.clear();
    setRemoteStreams({});
  }, []);

  const createPC = useCallback(
    (peerUserId: string, local: MediaStream | null) => {
      let pc = pcs.current.get(peerUserId);
      if (pc) return pc;
      pc = new RTCPeerConnection(RTC_CONFIG);
      if (local) {
        local.getTracks().forEach((t) => {
          try {
            pc!.addTrack(t, local!);
          } catch { /* ignore */ }
        });
      }
      pc.onicecandidate = (e) => {
        if (e.candidate && channelRef.current) {
          getSocket().emit("voice:signal", {
            toUserId: peerUserId,
            channelId: channelRef.current,
            kind: "ice",
            payload: e.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (stream) {
          setRemoteStreams((prev) => ({ ...prev, [peerUserId]: stream }));
        }
      };
      pcs.current.set(peerUserId, pc);
      return pc;
    },
    []
  );

  const join = useCallback(
    async (targetChannelId?: string | null, targetServerId?: string | null) => {
      const cid = targetChannelId ?? channelId;
      const sid = targetServerId ?? serverId;
      const me = useAuthStore.getState().user ?? user;
      if (!cid || !sid || !me) return;
      // If already in this channel, do nothing
      if (channelRef.current === cid && useVoiceStore.getState().channelId === cid) return;
      const socket = getSocket();
      setJoining(true);
      try {
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        } catch (e) {
          console.warn("mic unavailable, joining listen-only", e);
        }
        localStream.current = stream;
        if (stream) {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = !useVoiceStore.getState().selfMuted && !useVoiceStore.getState().selfDeafened;
          });
        }
        channelRef.current = cid;
        setChannel(cid, sid);

        const ack: { ok?: boolean; users?: { userId: string; username: string; displayName: string; avatarColor: string; avatarUrl?: string }[]; error?: string } =
          await new Promise((resolve) => {
            socket.emit("voice:join", { channelId: cid }, (res: unknown) => resolve(res as { ok?: boolean; users?: never[] }));
          });

        if (ack?.error) throw new Error(ack.error);
      const existing = (ack?.users ?? []).filter((u) => u.userId !== me.id);
      setPeers(
        existing.map((u) => ({ userId: u.userId, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl ?? "", muted: false, deafened: false, speaking: false }))
      );

        // Initiate offers to existing peers (joiner dials; existing peers answer)
        for (const peer of existing) {
          try {
            const pc = createPC(peer.userId, stream);
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            socket.emit("voice:signal", { toUserId: peer.userId, channelId: cid, kind: "offer", payload: offer });
          } catch (e) {
            console.error("offer failed", peer.userId, e);
          }
        }
      } catch (e) {
        console.error("voice join failed", e);
        channelRef.current = null;
        useVoiceStore.getState().reset();
      } finally {
        setJoining(false);
      }
    },
    [channelId, serverId, user, createPC, setChannel, setJoining, setPeers]
  );

  const leave = useCallback(() => {
    const socket = getSocket();
    try {
      socket.emit("voice:leave");
    } catch { /* ignore */ }
    try {
      localStream.current?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
    localStream.current = null;
    cleanupPCs();
    channelRef.current = null;
    useVoiceStore.getState().reset();
  }, [cleanupPCs]);

  // Keep global actions fresh so any component can drive the persistent bridge
  useEffect(() => {
    joinRef.current = join;
    voiceActions.join = (c, s) => joinRef.current(c, s);
    voiceActions.leave = leave;
  }, [join, leave]);

  // Signal handling (registered once per bridge mount; bridge is persistent)
  useEffect(() => {
    const socket = getSocket();
    const onSignal = async (msg: { fromUserId: string; channelId: string; kind: "offer" | "answer" | "ice"; payload: unknown }) => {
      if (msg.channelId !== channelRef.current) return;
      const from = msg.fromUserId;
      try {
        if (msg.kind === "offer") {
          const pc = createPC(from, localStream.current);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("voice:signal", { toUserId: from, channelId: msg.channelId, kind: "answer", payload: answer });
        } else if (msg.kind === "answer") {
          const pc = pcs.current.get(from);
          if (pc && pc.signalingState !== "stable") {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
          }
        } else if (msg.kind === "ice") {
          const pc = pcs.current.get(from);
          if (pc && msg.payload) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit));
            } catch (e) {
              console.warn("ice add failed", e);
            }
          }
        }
      } catch (e) {
        console.error("signal handling failed", e);
      }
    };
    const onUserJoined = (msg: { channelId: string; user: { userId: string; username: string; displayName: string; avatarColor: string; avatarUrl?: string } }) => {
      if (msg.channelId !== channelRef.current) return;
      if (msg.user.userId === useAuthStore.getState().user?.id) return;
      upsertPeer({ userId: msg.user.userId, username: msg.user.username, displayName: msg.user.displayName, avatarColor: msg.user.avatarColor, avatarUrl: msg.user.avatarUrl ?? "", muted: false, deafened: false, speaking: false });
    };
    const onUserLeft = (msg: { channelId: string; userId: string }) => {
      if (msg.channelId !== channelRef.current) return;
      removePeer(msg.userId);
      const pc = pcs.current.get(msg.userId);
      try {
        pc?.close();
      } catch { /* ignore */ }
      pcs.current.delete(msg.userId);
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[msg.userId];
        return next;
      });
    };
    const onUsers = (msg: { channelId: string; users: { userId: string; username: string; displayName: string; avatarColor: string; avatarUrl?: string; muted: boolean; deafened: boolean; speaking: boolean }[] }) => {
      if (msg.channelId !== channelRef.current) return;
      const selfId = useAuthStore.getState().user?.id;
      setPeers(msg.users.filter((u) => u.userId !== selfId).map((u) => ({ ...u, avatarUrl: u.avatarUrl ?? "" })));
    };
    const onState = (msg: { channelId: string; userId: string; muted: boolean; deafened: boolean; speaking: boolean }) => {
      if (msg.channelId !== channelRef.current) return;
      const { updatePeerState } = useVoiceStore.getState();
      updatePeerState(msg.userId, { muted: msg.muted, deafened: msg.deafened, speaking: msg.speaking });
    };

    socket.on("voice:signal", onSignal);
    socket.on("voice:user-joined", onUserJoined);
    socket.on("voice:user-left", onUserLeft);
    socket.on("voice:users", onUsers);
    socket.on("voice:state-updated", onState);
    return () => {
      socket.off("voice:signal", onSignal);
      socket.off("voice:user-joined", onUserJoined);
      socket.off("voice:user-left", onUserLeft);
      socket.off("voice:users", onUsers);
      socket.off("voice:state-updated", onState);
    };
  }, [createPC, removePeer, setPeers, upsertPeer]);

  // Mute / deafen sync
  useEffect(() => {
    localStream.current?.getAudioTracks().forEach((t) => {
      t.enabled = !selfMuted && !selfDeafened;
    });
    if (channelRef.current) {
      getSocket().emit("voice:state", { channelId: channelRef.current, muted: selfMuted, deafened: selfDeafened });
    }
  }, [selfMuted, selfDeafened]);

  return { peers, remoteStreams, localStream: localStream.current, join, leave };
}

/** Persistent owner: keeps WebRTC alive across channel navigation + plays remote audio globally. */
export function VoiceBridge() {
  const channelId = useVoiceStore((s) => s.channelId);
  const serverId = useVoiceStore((s) => s.serverId);
  const selfDeafened = useVoiceStore((s) => s.selfDeafened);
  const { remoteStreams } = useVoice(channelId, serverId);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([userId, stream]) => {
      const el = document.getElementById(`voice-audio-${userId}`) as HTMLAudioElement | null;
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.muted = false;
        void el.play().catch(() => {});
      }
    });
  }, [remoteStreams]);

  if (!channelId) return null;
  return (
    <div className="hidden">
      {Object.entries(remoteStreams).map(([userId]) => (
        <audio key={userId} id={`voice-audio-${userId}`} autoPlay playsInline muted={selfDeafened} />
      ))}
      <span className="hidden">{serverId}</span>
    </div>
  );
}
