import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(32).regex(/^[a-z0-9-_]+$/).optional(),
  topic: z.string().max(256).optional(),
  categoryId: z.string().nullable().optional(),
  nameColor: z.string().max(32).optional(),
  nameGradient: z.string().max(256).optional(),
});

export async function PATCH(req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await prisma.channel.findUnique({ where: { id: params.channelId } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasPermission(userId, channel.serverId, "manageChannels"))) {
    return NextResponse.json({ error: "Missing permission: Manage channels" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel data" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.toLowerCase();
  if (parsed.data.topic !== undefined) data.topic = parsed.data.topic.slice(0, 256);
  if (parsed.data.nameColor !== undefined) data.nameColor = parsed.data.nameColor.slice(0, 32);
  if (parsed.data.nameGradient !== undefined) data.nameGradient = parsed.data.nameGradient.slice(0, 256);
  if (parsed.data.categoryId !== undefined) {
    if (parsed.data.categoryId === null) {
      data.categoryId = null;
    } else {
      const cat = await prisma.serverCategory.findUnique({ where: { id: parsed.data.categoryId } });
      if (!cat || cat.serverId !== channel.serverId) return NextResponse.json({ error: "Category not found" }, { status: 400 });
      data.categoryId = cat.id;
    }
  }
  const updated = await prisma.channel.update({ where: { id: channel.id }, data });
  return NextResponse.json({ channel: updated });
}

export async function DELETE(_req: Request, { params }: { params: { channelId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await prisma.channel.findUnique({ where: { id: params.channelId }, include: { server: true } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasPermission(userId, channel.serverId, "manageChannels"))) {
    return NextResponse.json({ error: "Missing permission: Manage channels" }, { status: 403 });
  }
  if (channel.name === "general") return NextResponse.json({ error: "Cannot delete #general" }, { status: 400 });
  await prisma.channel.delete({ where: { id: channel.id } });
  return NextResponse.json({ ok: true });
}
