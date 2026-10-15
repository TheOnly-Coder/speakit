import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { CHANNEL_PERMS } from "@/lib/channelPerms";
import { z } from "zod";

const putSchema = z.object({
  overwrites: z
    .array(
      z.object({
        target: z.string().min(1).max(64),
        allow: z.array(z.string()).default([]),
        deny: z.array(z.string()).default([]),
      })
    )
    .max(100),
});

function clean(list: string[]): string[] {
  return [...new Set(list.filter((p) => (CHANNEL_PERMS as readonly string[]).includes(p)))];
}

export async function GET(_req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await prisma.channel.findUnique({ where: { id: params.channelId }, include: { overwrites: true } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasPermission(userId, channel.serverId, "manageChannels"))) {
    return NextResponse.json({ error: "Missing permission: Manage channels" }, { status: 403 });
  }
  return NextResponse.json({ overwrites: channel.overwrites });
}

export async function PUT(req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await prisma.channel.findUnique({ where: { id: params.channelId }, include: { server: true } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasPermission(userId, channel.serverId, "manageChannels"))) {
    return NextResponse.json({ error: "Missing permission: Manage channels" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid overwrites" }, { status: 400 });

  // Duplicate targets would violate @@unique([channelId, target]) -> 500.
  // Keep the last entry per target (or reject); dedupe here.
  const seen = new Set<string>();
  const deduped = [...parsed.data.overwrites].reverse().filter((o) => {
    if (seen.has(o.target)) return false;
    seen.add(o.target);
    return true;
  }).reverse();

  const roleIds = deduped.filter((o) => o.target !== "everyone").map((o) => o.target);
  if (roleIds.length > 0) {
    const count = await prisma.role.count({ where: { id: { in: roleIds }, serverId: channel.serverId } });
    if (count !== new Set(roleIds).size) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.channelOverwrite.deleteMany({ where: { channelId: channel.id } }),
    prisma.channelOverwrite.createMany({
      data: deduped.map((o) => ({
        channelId: channel.id,
        target: o.target === "everyone" ? "everyone" : o.target,
        allow: JSON.stringify(clean(o.allow)),
        deny: JSON.stringify(clean(o.deny)),
      })),
    }),
  ]);
  const overwrites = await prisma.channelOverwrite.findMany({ where: { channelId: channel.id } });
  return NextResponse.json({ overwrites });
}
