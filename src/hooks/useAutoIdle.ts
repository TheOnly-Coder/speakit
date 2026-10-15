"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Discord-style auto-away: no input for IDLE_TIMEOUT_MS with the tab open
 * shows you as Idle (not Offline); the next input / focus / reconnect
 * restores exactly the status you had before.
 *
 * Only applies while your manual status is `online` — DND / invisible /
 * manual-idle are never overridden. The overlay is ephemeral (server-side
 * flag, never written to the DB), so reloads and reconnects recover cleanly.
 */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "click", "keydown", "input", "touchstart", "wheel", "scroll"] as const;

/**
 * Fire-and-forget proof-of-life: call right before sending a message, typing,
 * reacting, etc. so an auto-away user INSTANTLY flips back to whatever status
 * they had before — even if the global activity listeners missed the input
 * (mobile autocomplete, paste via context menu, second tab, …).
 * The server also restores on any inbound event as a backstop.
 */
export function pokeActive() {
  try {
    getSocket().emit("presence:active");
  } catch {
    /* offline — the server restores the stored status on reconnect */
  }
  try {
    window.dispatchEvent(new Event("speakit:activity"));
  } catch {
    /* ignore */
  }
}

export function useAutoIdle(timeoutMs: number = IDLE_TIMEOUT_MS) {
  const userId = useAuthStore((s) => s.user?.id);
  const manualStatus = useAuthStore((s) => s.user?.status);

  useEffect(() => {
    if (!userId || manualStatus !== "online") return;

    let idle = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const emit = (event: "presence:idle" | "presence:active") => {
      try {
        getSocket().emit(event);
      } catch {
        /* offline — the server restores the stored status on reconnect */
      }
    };

    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Re-check: the user may have picked DND/invisible while away.
        if (useAuthStore.getState().user?.status !== "online") return;
        if (idle) return;
        idle = true;
        emit("presence:idle");
      }, timeoutMs);
    };

    const activity = () => {
      if (idle) {
        idle = false;
        emit("presence:active");
      }
      arm();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") activity();
    };

    // Still idle across a blip: the server drops the flag on disconnect and
    // re-broadcasts the stored status on connect, so re-assert idle instead
    // of flashing online for someone who is still AFK. Any real input right
    // after will emit presence:active and restore anyway.
    const onSocketConnect = () => {
      if (idle) emit("presence:idle");
    };

    for (const name of ACTIVITY_EVENTS) {
      if (name === "scroll") continue; // scroll doesn't bubble to window — see below
      window.addEventListener(name, activity, { passive: true });
    }
    window.addEventListener("focus", activity);
    window.addEventListener("online", activity);
    // Explicit proof-of-life from message send / typing (see pokeActive):
    // resets the idle timer + restores instantly even if no DOM input fired.
    window.addEventListener("speakit:activity", activity);
    // Inner message lists scroll without bubbling — capture at document.
    document.addEventListener("scroll", activity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    const socket = getSocket();
    socket.on("connect", onSocketConnect);

    arm();

    return () => {
      if (timer) clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) {
        if (name === "scroll") continue;
        window.removeEventListener(name, activity);
      }
      window.removeEventListener("focus", activity);
      window.removeEventListener("online", activity);
      window.removeEventListener("speakit:activity", activity);
      document.removeEventListener("scroll", activity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      socket.off("connect", onSocketConnect);
    };
  }, [userId, manualStatus, timeoutMs]);
}
