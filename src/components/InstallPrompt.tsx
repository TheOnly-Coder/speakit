"use client";

import { useState } from "react";
import { Download, Share, X, Check } from "lucide-react";
import { usePwaInstall, isIosDevice } from "./PwaRegister";

const DISMISSED_KEY = "speakit-install-dismissed-v1";

/**
 * Discord-style "install our app" nudge + real install button.
 * - Chromium/Android: triggers the real beforeinstallprompt flow.
 * - iOS Safari: shows Share → Add to Home Screen steps (no prompt API there).
 * - Dismiss is remembered per-device.
 */
export function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const { canInstall, isStandalone, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return true;
    }
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showIos, setShowIos] = useState(false);

  if (isStandalone || dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const onInstall = async () => {
    if (isIosDevice()) {
      setShowIos((v) => !v);
      return;
    }
    if (!canInstall) {
      // Browser hasn't fired the prompt (already installed / unsupported):
      // fall back to showing manual instructions.
      setShowIos(true);
      return;
    }
    setBusy(true);
    const ok = await install();
    setBusy(false);
    if (ok) {
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    }
  };

  if (compact) {
    return (
      <button
        onClick={() => void onInstall()}
        className="brand-gradient flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold text-white shadow-glow transition hover:brightness-110 active:scale-95"
        title="Install Speakit on this device"
      >
        {done ? <Check size={13} /> : <Download size={13} />}
        {done ? "Installed!" : busy ? "Installing…" : "Install App"}
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-speakit-blurple/30 bg-gradient-to-br from-speakit-blurple/20 via-[#7c3aed]/15 to-fuchsia-500/10 p-4 shadow-card backdrop-blur">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-speakit-blurple/25 blur-3xl" />
      <button onClick={dismiss} className="absolute right-2 top-2 rounded-full p-1.5 text-speakit-muted transition hover:bg-white/10 hover:text-white" title="Dismiss">
        <X size={14} />
      </button>
      <div className="relative flex items-center gap-3">
        <div className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-glow">S</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold tracking-tight text-white">Get the Speakit app</div>
          <div className="text-xs text-speakit-muted">Add to your home screen for full-screen, faster launches.</div>
        </div>
      </div>
      <div className="relative mt-3 flex gap-2">
        <button
          onClick={() => void onInstall()}
          className="brand-gradient flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-extrabold text-white shadow-glow transition hover:brightness-110 active:scale-[0.99]"
        >
          {done ? <Check size={14} /> : <Download size={14} />}
          {done ? "Installed!" : busy ? "Installing…" : isIosDevice() ? "How to install" : "Install Speakit"}
        </button>
        <button onClick={dismiss} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold text-white transition hover:bg-white/[0.12]">
          Later
        </button>
      </div>
      {showIos && (
        <div className="mt-3 rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-speakit-text">
          <div className="mb-1 flex items-center gap-1 font-bold text-white">
            <Share size={13} /> Add to Home Screen
          </div>
          <ol className="list-decimal space-y-0.5 pl-4 text-speakit-muted">
            <li>
              Tap the <b className="text-white">Share</b> button in your browser toolbar.
            </li>
            <li>
              Scroll and tap <b className="text-white">Add to Home Screen</b>.
            </li>
            <li>
              Tap <b className="text-white">Add</b> — Speakit opens full-screen like a native app.
            </li>
          </ol>
          <div className="mt-1 text-[11px]">On Android/Chrome the Install button above does this automatically.</div>
        </div>
      )}
    </div>
  );
}
