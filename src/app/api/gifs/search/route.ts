import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { searchTenor } from "@/lib/tenor";

/** GIF search proxy (Tenor). Requires TENOR_API_KEY on the server. */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").slice(0, 128);
  try {
    const gifs = await searchTenor(q, 12);
    return NextResponse.json({ gifs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GIF search failed";
    const status = /not configured/i.test(msg) ? 503 : 502;
    return NextResponse.json({ error: msg, unconfigured: status === 503 }, { status });
  }
}
