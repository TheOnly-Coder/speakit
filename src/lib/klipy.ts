/** Klipy GIF search via server-side proxy (keeps the API key off the client). */

export type KlipyGif = {
  id: string;
  url: string;
  preview: string;
  title: string;
};

type KlipyFile = { url?: string };
type KlipyItem = {
  id?: number | string;
  slug?: string;
  title?: string;
  file?: Record<string, Record<string, KlipyFile>>;
};

function pick(item: KlipyItem): KlipyGif | null {
  const file = item.file ?? {};
  const size = file.md ?? file.sm ?? file.hd ?? {};
  const url = size.gif?.url ?? "";
  const preview = size.jpg?.url ?? size.webp?.url ?? url;
  if (!url.startsWith("https://static.klipy.com/")) return null;
  return {
    id: String(item.id ?? item.slug ?? url),
    url,
    preview: preview.startsWith("https://static.klipy.com/") ? preview : url,
    title: item.title ?? "GIF",
  };
}

export async function searchKlipy(query: string, limit = 12): Promise<KlipyGif[]> {
  const key = process.env.KLIPY_API_KEY || "";
  if (!key) throw new Error("GIF search is not configured (missing KLIPY_API_KEY)");
  const q = query.trim().slice(0, 128);
  const endpoint = q ? "search" : "trending";
  const params = new URLSearchParams({
    per_page: String(Math.min(Math.max(limit, 1), 24)),
    format_filter: "gif,jpg",
    content_filter: "medium",
  });
  if (q) params.set("q", q);
  const url = `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${endpoint}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Klipy error ${res.status}`);
  const data = (await res.json()) as { result?: boolean; data?: { data?: KlipyItem[] } | KlipyItem[] };
  const raw = data?.data;
  const items = Array.isArray(raw) ? raw : raw?.data ?? [];
  if (!Array.isArray(items)) throw new Error("Klipy returned an unexpected response");
  return items.map(pick).filter((g): g is KlipyGif => g !== null).slice(0, 24);
}
