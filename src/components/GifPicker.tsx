"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Star, Loader2 } from "lucide-react";
import type { GifFavorite } from "@/store/useAppStore";

export type PickedGif = { url: string; preview: string; title: string };

export function GifPicker({ onPick }: { onPick: (gif: PickedGif) => void }) {
  const [tab, setTab] = useState<"search" | "favorites">("search");
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<PickedGif[]>([]);
  const [favs, setFavs] = useState<GifFavorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unconfigured, setUnconfigured] = useState(false);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/gifs/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "GIF search failed");
        setUnconfigured(!!data.unconfigured);
        setGifs([]);
        return;
      }
      setGifs(data.gifs ?? []);
    } catch {
      setError("GIF search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFavs = useCallback(async () => {
    try {
      const res = await fetch("/api/gifs/favorites", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setFavs(data.gifs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Always know favorites so the star state is correct in search too.
    void loadFavs();
  }, [loadFavs]);

  useEffect(() => {
    if (tab === "search") void load("");
    else void loadFavs();
  }, [tab, load, loadFavs]);

  useEffect(() => {
    if (tab !== "search") return;
    const t = setTimeout(() => void load(q), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [q, tab, load]);

  const toggleFav = async (gif: PickedGif, isFav: boolean) => {
    if (isFav) {
      await fetch(`/api/gifs/favorites?url=${encodeURIComponent(gif.url)}`, { method: "DELETE" });
      setFavs((f) => f.filter((x) => x.url !== gif.url));
    } else {
      const res = await fetch("/api/gifs/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gif.url, preview: gif.preview }),
      });
      const data = await res.json();
      if (res.ok && data.gif) setFavs((f) => [data.gif, ...f]);
    }
  };

  const favUrls = new Set(favs.map((f) => f.url));

  return (
    <div className="menu-pop w-80 rounded-2xl border border-white/10 bg-[#14141b]/95 p-2.5 shadow-pop backdrop-blur-xl">
      <div className="mb-2 flex gap-1 rounded-full border border-white/[0.06] bg-black/20 p-1">
        <button onClick={() => setTab("search")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold transition ${tab === "search" ? "brand-gradient text-white shadow-glow" : "text-speakit-muted hover:text-white"}`}>
          <Search size={13} /> Search
        </button>
        <button onClick={() => setTab("favorites")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold transition ${tab === "favorites" ? "brand-gradient text-white shadow-glow" : "text-speakit-muted hover:text-white"}`}>
          <Star size={13} /> Favorites
        </button>
      </div>
      {tab === "search" && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search KLIPY…"
          className="mb-2 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none transition placeholder:text-speakit-muted/70 focus:border-speakit-blurple/50 focus:ring-2 focus:ring-speakit-blurple/20"
        />
      )}
      {loading && <div className="flex items-center justify-center py-6 text-speakit-muted"><Loader2 size={18} className="animate-spin" /></div>}
      {error && (
        <div className="px-2 py-4 text-center text-xs text-speakit-muted">
          {unconfigured
            ? "GIF search needs a Klipy key. Server admin: add KLIPY_API_KEY to the environment."
            : error}
        </div>
      )}
      {!loading && !error && (
        <div className="px-2 pb-1 text-right text-[10px] text-speakit-muted">GIFs via KLIPY</div>
      )}
      {!loading && !error && (
        <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
          {(tab === "search" ? gifs : favs.map((f) => ({ url: f.url, preview: f.preview || f.url, title: "GIF" }))).map((g) => {
            const isFav = favUrls.has(g.url);
            return (
              <div key={g.url} className="group relative overflow-hidden rounded-md bg-black/30">
                <button onClick={() => onPick(g)} className="block w-full" title={g.title}>
                  {/* Auto-play: animated GIF url, not the static jpg preview. */}
                  <img src={g.url} alt={g.title} loading="lazy" className="h-24 w-full object-cover hover:opacity-90" />
                </button>
                <button
                  onClick={() => void toggleFav(g, isFav)}
                  title={isFav ? "Unfavorite" : "Favorite"}
                  className={`absolute right-1 top-1 rounded bg-black/60 p-1 transition-opacity ${
                    isFav
                      ? "text-yellow-400 opacity-100"
                      : "text-white/70 opacity-0 hover:text-yellow-400 focus:opacity-100 group-hover:opacity-100"
                  }`}
                >
                  <Star size={13} fill={isFav ? "currentColor" : "none"} />
                </button>
              </div>
            );
          })}
          {((tab === "search" && gifs.length === 0) || (tab === "favorites" && favs.length === 0)) && (
            <div className="col-span-2 px-2 py-4 text-center text-xs text-speakit-muted">
              {tab === "favorites" ? "Star GIFs to find them here." : "No GIFs found."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
