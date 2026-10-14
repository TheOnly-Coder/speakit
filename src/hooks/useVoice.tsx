"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useVoiceStore } from "@/store/useVoiceStore";
import { useAuthStore } from "@/store/useAuthStore";

function buildRtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
  ];
  // Mobile-to-mobile calls across carriers almost always need TURN (symmetric
  // NATs). Set these three env vars to enable it, e.g. a free Metered/Cloudflare
  // TURN credential. Without TURN, voice may work on wifi but fail on mobile data.
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    iceServers.push({ urls: [turnUrl], username: turnUser, credential: turnCred });
  }
  return { iceServers };
}

export function hasTurnConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_TURN_URL && process.env.NEXT_PUBLIC_TURN_USERNAME && process.env.NEXT_PUBLIC_TURN_CREDENTIAL);
}

export function canShareScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown } | undefined;
  return !!md?.getDisplayMedia;
}

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
  /** ICE candidates that arrived before the remote description — flushed after. */
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const channelRef = useRef<string | null>(null);
  const joinRef = useRef<(c: string, s: string) => Promise<void>>(async () => {});

  const flushIce = useCallback(async (peerUserId: string) => {
    const pc = pcs.current.get(peerUserId);
    const queued = pendingIce.current.get(peerUserId);
    if (!pc || !queued || queued.length === 0 || !pc.remoteDescription) return;
    pendingIce.current.delete(peerUserId);
    for (const init of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(init));
      } catch {
        /* stale candidate — safe to drop */
      }
    }
  }, []);

  const queueOrAddIce = useCallback(
    async (peerUserId: string, init: RTCIceCandidateInit) => {
      const pc = pcs.current.get(peerUserId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(init));
          return;
        } catch {
          /* fall through to queue */
        }
      }
      const list = pendingIce.current.get(peerUserId) ?? [];
      if (list.length < 50) {
        list.push(init);
        pendingIce.current.set(peerUserId, list);
      }
    },
    []
  );

  const cleanupPCs = useCallback(() => {
    pcs.current.forEach((pc) => {
      try {
        pc.close();
      } catch { /* ignore */ }
    });
    pcs.current.clear();
    pendingIce.current.clear();
    setRemoteStreams({});
  }, []);

  const renegotiate = useCallback(async (peerUserId: string) => {
    const pc = pcs.current.get(peerUserId);
    const cid = channelRef.current;
    if (!pc || !cid) return;
    // Never negotiate mid-handshake — the in-flight exchange will pick up new
    // tracks when it completes (or the next renegotiate will).
    if (pc.signalingState !== "stable") return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket().emit("voice:signal", { toUserId: peerUserId, channelId: cid, kind: "offer", payload: offer });
    } catch (e) {
      console.error("renegotiate failed", e);
    }
  }, []);

  // Waits for the handshake to settle, then re-offers (used after an ICE restart).
  const renegotiateAfterStable = useCallback(
    async (peerUserId: string) => {
      for (let i = 0; i < 20; i++) {
        const pc = pcs.current.get(peerUserId);
        if (!pc) return;
        if (pc.signalingState === "stable" && pc.connectionState !== "closed") {
          await renegotiate(peerUserId);
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    },
    [renegotiate]
  );

  const createPC = useCallback(
    (peerUserId: string, local: MediaStream | null) => {
      let pc = pcs.current.get(peerUserId);
      if (pc) return pc;
      pc = new RTCPeerConnection(buildRtcConfig());
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
      pc.onconnectionstatechange = () => {
        const state = pc!.connectionState;
        useVoiceStore.getState().setPeerConn(peerUserId, state);
        if (state === "failed") {
          // One ICE restart attempt before surfacing "failed" to the user.
          try {
            pc!.restartIce();
          } catch { /* ignore */ }
          void renegotiateAfterStable(peerUserId);
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
      useVoiceStore.getState().setPeerConn(peerUserId, pc.connectionState);
      return pc;
    },
    [renegotiate, renegotiateAfterStable]
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
      if (!socket.connected) {
        useVoiceStore.getState().setJoinError("Not connected — retrying… (check your connection)");
        try {
          socket.connect();
        } catch { /* ignore */ }
      }
      setJoining(true);
      useVoiceStore.getState().setJoinError(null);
      useVoiceStore.getState().setMicBlocked(false);
      try {
        let stream: MediaStream | null = null;
        let micBlocked = false;
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error("no mic api");
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        } catch (e) {
          micBlocked = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
          console.warn("mic unavailable, joining listen-only", e);
        }
        localStream.current = stream;
        if (stream) {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = !useVoiceStore.getState().selfMuted && !useVoiceStore.getState().selfDeafened;
          });
        } else {
          useVoiceStore.getState().setMicBlocked(true);
          if (micBlocked) {
            useVoiceStore.getState().setJoinError(null);
          }
        }
        channelRef.current = cid;
        setChannel(cid, sid);
        useVoiceStore.getState().setConnectedAt(Date.now());

        // Never hang on "Connecting…" — the ack must arrive within 12s.
        const ack: { ok?: boolean; users?: { userId: string; username: string; displayName: string; avatarColor: string; avatarUrl?: string }[]; error?: string } =
          await new Promise((resolve) => {
            let done = false;
            const timer = setTimeout(() => {
              if (!done) {
                done = true;
                resolve({ error: "Voice server didn't answer in time. Check your connection and retry." });
              }
            }, 12000);
            try {
              socket.emit("voice:join", { channelId: cid }, (res: unknown) => {
                if (!done) {
                  done = true;
                  clearTimeout(timer);
                  resolve(res as { ok?: boolean; users?: never[] });
                }
              });
            } catch {
              if (!done) {
                done = true;
                clearTimeout(timer);
                resolve({ error: "Couldn't reach the voice server. Check your connection and retry." });
              }
            }
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
        const message = e instanceof Error ? e.message : "Couldn't join voice. Retry in a moment.";
        useVoiceStore.getState().setJoinError(message);
        try {
          localStream.current?.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch { /* ignore */ }
          });
        } catch { /* ignore */ }
        localStream.current = null;
        channelRef.current = null;
        useVoiceStore.getState().reset();
        useVoiceStore.getState().setJoinError(message);
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
    pendingIce.current.clear();
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
      const selfId = useAuthStore.getState().user?.id;
      try {
        if (msg.kind === "offer") {
          const pc = createPC(from, localStream.current);
          // Perfect-negotiation-lite: simultaneous offers ("glare") happen when
          // two people join at once. The lexicographically-smaller user is
          // polite (rolls back and answers); the other ignores and waits.
          if (pc.signalingState !== "stable") {
            const polite = !!selfId && selfId < from;
            if (!polite) return;
            try {
              await pc.setLocalDescription({ type: "rollback" });
            } catch {
              /* already stable — continue */
            }
          }
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
          await flushIce(from);
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
            await flushIce(from);
          }
        } else if (msg.kind === "ice") {
          if (msg.payload) {
            await queueOrAddIce(from, msg.payload as RTCIceCandidateInit);
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
      pendingIce.current.delete(msg.userId);
      useVoiceStore.getState().setPeerConn(msg.userId, null);
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
  }, [createPC, removePeer, setPeers, upsertPeer, renegotiate, flushIce, queueOrAddIce]);

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
        el.muted = selfDeafened;
        void el.play().catch(() => {
          // Mobile browsers may block playback until the next tap — retry then.
          const unlock = () => {
            void el.play().catch(() => {});
            window.removeEventListener("pointerdown", unlock);
          };
          window.addEventListener("pointerdown", unlock, { once: true });
        });
      } else if (el) {
        el.muted = selfDeafened;
      }
    });
  }, [remoteStreams, selfDeafened]);

  if (!channelId) return null;
  return (
    <div className="hidden">
      {Object.entries(remoteStreams).map(([userId]) => (
        <audio key={userId} id={`voice-audio-${userId}`} autoPlay playsInline preload="none" />
      ))}
      <span className="hidden">{serverId}</span>
    </div>
  );
}
