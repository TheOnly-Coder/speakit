"use client";

import { useMemo, useState } from "react";
import { NATIVE_EMOJI } from "@/lib/emoji";
import type { ServerEmoji } from "@/store/useAppStore";

export function EmojiPicker({
  serverEmojis,
  externalEmojis,
  allowExternal,
  onPick,
}: {
  serverEmojis: ServerEmoji[];
  externalEmojis: ServerEmoji[];
  allowExternal: boolean;
  onPick: (text: string) => void;
}) {
  const [q, setQ] = useState("");
  const native = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return NATIVE_EMOJI;
    return NATIVE_EMOJI.filter((e) => e.name.includes(needle));
  }, [q]);
  const mine = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return serverEmojis;
    return serverEmojis.filter((e) => e.name.includes(needle));
  }, [q, serverEmojis]);
  const others = useMemo(() => {
    if (!allowExternal) return [];
    const needle = q.trim().toLowerCase();
    const mineNames = new Set(serverEmojis.map((e) => e.name));
    return externalEmojis.filter((e) => !mineNames.has(e.name) && (!needle || e.name.includes(needle)));
  }, [q, allowExternal, serverEmojis, externalEmojis]);

  return (
    <div className="w-72 rounded-lg bg-[#1e1f22] p-2 shadow-2xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search emoji…"
        className="mb-2 w-full rounded bg-speakit-input px-2 py-1.5 text-sm text-white outline-none placeholder:text-speakit-muted"
      />
      <div className="max-h-64 overflow-y-auto">
        {mine.length > 0 && (
          <>
            <div className="px-1 py-1 text-[10px] font-bold uppercase text-speakit-muted">This server</div>
            <div className="flex flex-wrap gap-0.5">
              {mine.map((e) => (
                <button key={e.id} title={`:${e.name}:`} onClick={() => onPick(`:${e.name}:`)} className="rounded p-1 hover:bg-white/10">
                  <img src={e.url} alt={e.name} className="h-7 w-7 object-contain" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}
        {others.length > 0 && (
          <>
            <div className="px-1 py-1 text-[10px] font-bold uppercase text-speakit-muted">Other servers</div>
            <div className="flex flex-wrap gap-0.5">
              {others.map((e) => (
                <button key={e.id} title={`:${e.name}:`} onClick={() => onPick(`:${e.name}:`)} className="rounded p-1 hover:bg-white/10">
                  <img src={e.url} alt={e.name} className="h-7 w-7 object-contain" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="px-1 py-1 text-[10px] font-bold uppercase text-speakit-muted">Emoji</div>
        <div className="flex flex-wrap gap-0.5">
          {native.map((e) => (
            <button key={e.char + e.name} title={e.name} onClick={() => onPick(e.char)} className="rounded p-1 text-xl hover:bg-white/10">
              {e.char}
            </button>
          ))}
          {native.length === 0 && mine.length === 0 && <div className="px-2 py-3 text-xs text-speakit-muted">No matches</div>}
        </div>
      </div>
    </div>
  );
}
