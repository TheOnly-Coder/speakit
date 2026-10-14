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
  rejoin: () => Promise<void>;
  startShare: () => Promise<void>;
  stopShare: () => void;
} = {
  join: async () => {
    console.warn("voice: bridge not mounted yet");
  },
  leave: () => {},
  rejoin: async () => {
    console.warn("voice: bridge not mounted yet");
  },
  startShare: async () => {
    console.warn("voice: bridge not mounted yet");
  },
  stopShare: () => {},
};

export function useVoice(channelId: string | null, serverId: string | null) {
  const { user } = useAuthStore();
  const { peers, setPeers, upsertPeer, removePeer, setChannel, selfMuted, selfDeafened, setJoining } = useVoiceStore();
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const localStream = useRef<MediaStream | null>(null);
  const localScreen = useRef<MediaStream | null>(null);
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

  const renegotiate = useCallback(async (peerUserId: string) => {
    const pc = pcs.current.get(peerUserId);
    const cid = channelRef.current;
    if (!pc || !cid) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket().emit("voice:signal", { toUserId: peerUserId, channelId: cid, kind: "offer", payload: offer });
    } catch (e) {
      console.error("renegotiate failed", e);
    }
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
        if (!stream) return;
        // Screen shares carry video; voice carries audio-only.
        if (stream.getVideoTracks().length > 0) {
          useVoiceStore.getState().setScreenStream(peerUserId, stream);
        } else {
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
        useVoiceStore.getState().setConnectedAt(Date.now());

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

  const stopShare = useCallback(() => {
    const st = useVoiceStore.getState();
    try {
      localScreen.current?.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    localScreen.current = null;
    st.setSharingSelf(false);
    st.setSelfScreen(null);
    st.setScreenStream("self", null);
    // Drop screen senders everywhere and renegotiate so peers remove the video.
    pcs.current.forEach((pc, peerId) => {
      let changed = false;
      pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === "video") {
          try {
            pc.removeTrack(sender);
            changed = true;
          } catch {
            /* ignore */
          }
        }
      });
      if (changed) void renegotiate(peerId);
    });
  }, [renegotiate]);

  const startShare = useCallback(async () => {
    if (!channelRef.current) return;
    const st = useVoiceStore.getState();
    if (st.sharingSelf) return;
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (e) {
      console.warn("screen share cancelled/unavailable", e);
      return;
    }
    localScreen.current = screen;
    st.setSharingSelf(true);
    st.setSelfScreen(screen);
    screen.getVideoTracks().forEach((t) => {
      t.onended = () => stopShare();
    });
    for (const [peerId, pc] of pcs.current) {
      let added = false;
      for (const t of screen.getTracks()) {
        const already = pc.getSenders().some((s) => s.track === t);
        if (!already) {
          try {
            pc.addTrack(t, screen);
            added = true;
          } catch {
            /* ignore */
          }
        }
      }
      if (added) await renegotiate(peerId);
    }
  }, [renegotiate, stopShare]);

  const leave = useCallback(() => {
    const socket = getSocket();
    try {
      socket.emit("voice:leave");
    } catch { /* ignore */ }
    try {
      localStream.current?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
    try {
      localScreen.current?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
    localStream.current = null;
    localScreen.current = null;
    cleanupPCs();
    channelRef.current = null;
    useVoiceStore.getState().reset();
  }, [cleanupPCs]);

  // Keep global actions fresh so any component can drive the persistent bridge
  useEffect(() => {
    joinRef.current = join;
    voiceActions.join = (c, s) => joinRef.current(c, s);
    voiceActions.leave = leave;
    voiceActions.rejoin = async () => {
      const st = useVoiceStore.getState();
      const cid = st.channelId;
      const sid = st.serverId;
      if (!cid || !sid) return;
      try {
        localStream.current?.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
      localStream.current = null;
      channelRef.current = null; // bypass the already-here guard
      await joinRef.current(cid, sid);
    };
    voiceActions.startShare = startShare;
    voiceActions.stopShare = stopShare;
  }, [join, leave, startShare, stopShare]);

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
          // New peer arrived while we're sharing: push the screen to them too.
          if (localScreen.current) {
            let added = false;
            for (const t of localScreen.current.getTracks()) {
              const already = pc.getSenders().some((s) => s.track === t);
              if (!already) {
                try {
                  pc.addTrack(t, localScreen.current!);
                  added = true;
                } catch {
                  /* ignore */
                }
              }
            }
            if (added) await renegotiate(from);
          }
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
      useVoiceStore.getState().setScreenStream(msg.userId, null);
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
  }, [createPC, removePeer, setPeers, upsertPeer, renegotiate]);

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
    const resync = () => {
      const st = useVoiceStore.getState();
      if (st.channelId) void voiceActions.rejoin();
    };
    window.addEventListener("speakit:resync", resync);
    return () => window.removeEventListener("speakit:resync", resync);
  }, []);

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
