"use client";

import { useCallback, useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    try {
      window.localStorage.setItem("speakit-pwa-installed", "1");
    } catch {
      /* ignore */
    }
    notify();
  });
}

export function usePwaInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((x) => x + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const canInstall = deferred !== null;
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);

  const install = useCallback(async () => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") deferred = null;
      notify();
      return choice.outcome === "accepted";
    } catch {
      return false;
    }
  }, []);

  return { canInstall, isStandalone, install };
}

/** Registers /sw.js once (prod only — harmless in dev). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Skip SW in dev so hot-reload never serves stale chunks.
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline / unsupported — app still works */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}

export function isIosDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}
