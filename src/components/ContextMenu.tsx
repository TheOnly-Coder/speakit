"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CtxItem =
  | { type: "sep" }
  | { type: "item"; label: string; hint?: string; danger?: boolean; onClick: () => void }
  | { type: "header"; label: string };

type CtxState = { x: number; y: number; items: CtxItem[] } | null;

let setGlobal: ((s: CtxState) => void) | null = null;

export function openContextMenu(x: number, y: number, items: CtxItem[]) {
  setGlobal?.({ x, y, items });
}

/** Tiny helper: attach Discord-style right-click to any element. */
export function ctxProps(items: () => CtxItem[]) {
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(e.clientX, e.clientY, items());
    },
  };
}

export function ContextMenuHost() {
  const [state, setState] = useState<CtxState>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGlobal = setState;
    return () => {
      if (setGlobal === setState) setGlobal = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    // Any scroll or resize dismisses, like Discord.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    // Focus for keyboard escape.
    requestAnimationFrame(() => ref.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [state]);

  if (!state || typeof document === "undefined") return null;

  const W = 220;
  const H = Math.min(360, state.items.length * 34 + 16);
  const x = Math.min(state.x, window.innerWidth - W - 8);
  const y = Math.min(state.y, window.innerHeight - H - 8);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={() => setState(null)} onContextMenu={(e) => { e.preventDefault(); setState(null); }} />
      <div
        ref={ref}
        tabIndex={-1}
        className="menu-pop fixed z-[91] w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-speakit-card/95 p-1.5 shadow-pop backdrop-blur-xl outline-none"
        style={{ left: x, top: y }}
      >
        {state.items.map((it, i) => {
          if (it.type === "sep") return <div key={i} className="my-1 h-px bg-white/10" />;
          if (it.type === "header")
            return (
              <div key={i} className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-speakit-muted">
                {it.label}
              </div>
            );
          return (
            <button
              key={i}
              onClick={() => {
                setState(null);
                // Let the menu unmount before running destructive confirms.
                setTimeout(() => it.onClick(), 0);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition ${
                it.danger ? "text-rose-300 hover:bg-rose-500 hover:text-white" : "text-speakit-text hover:bg-speakit-blurple hover:text-white"
              }`}
            >
              <span>{it.label}</span>
              {it.hint && <span className="ml-2 text-[11px] opacity-60">{it.hint}</span>}
            </button>
          );
        })}
      </div>
    </>,
    document.body
  );
}
