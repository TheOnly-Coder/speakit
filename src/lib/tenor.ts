/** Tenor GIF search via server-side proxy (keeps the API key off the client). */

export type TenorGif = {
  id: string;
  url: string;
  preview: string;
  title: string;
};

export async function searchTenor(query: string, limit = 12): Promise<TenorGif[]> {
  const key = process.env.TENOR_API_KEY || "";
  if (!key) throw new Error("Tenor is not configured (missing TENOR_API_KEY)");
  const endpoint = query.trim() ? "search" : "featured";
  const url =
    `https://tenor.googleapis.com/v2/${endpoint}?key=${encodeURIComponent(key)}` +
    `&limit=${Math.min(Math.max(limit, 1), 24)}&media_filter=gif,tinygif&contentfilter=medium` +
    (query.trim() ? `&q=${encodeURIComponent(query.trim().slice(0, 128))}` : "");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tenor error ${res.status}`);
  const data = (await res.json()) as {
    results?: { id: string; title?: string; media_formats?: { gif?: { url?: string }; tinygif?: { url?: string } } }[];
  };
  return (data.results ?? [])
    .map((r) => ({
      id: String(r.id),
      url: r.media_formats?.gif?.url ?? "",
      preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? "",
      title: r.title ?? "GIF",
    }))
    .filter((g) => g.url.startsWith("https://media.tenor.com/"));
}
