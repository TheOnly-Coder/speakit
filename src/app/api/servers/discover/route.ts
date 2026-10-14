import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

/** Public directory of discoverable servers. */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 64);
  const servers = await prisma.server.findMany({
    where: {
      discoverable: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { tags: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { members: true } },
      members: { where: { userId }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    servers: servers.map((s) => ({
      id: s.id,
      name: s.name,
      iconColor: s.iconColor,
      iconUrl: s.iconUrl,
      bannerUrl: (s as { bannerUrl?: string }).bannerUrl ?? "",
      description: (s as { description?: string }).description ?? "",
      tags: parseTags((s as { tags?: string }).tags ?? ""),
      memberCount: s._count.members,
      alreadyMember: s.members.length > 0,
    })),
  });
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().replace(/^#+/, "").slice(0, 24))
    .filter(Boolean)
    .slice(0, 8);
}
