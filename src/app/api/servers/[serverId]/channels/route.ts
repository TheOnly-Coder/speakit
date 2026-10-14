import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { createChannelSchema } from "@/lib/validations";
import { hasPermission } from "@/lib/permissions";

export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageChannels"))) {
    return NextResponse.json({ error: "Missing permission: Manage channels" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createChannelSchema.safeParse({ ...body, serverId: params.serverId });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid channel" }, { status: 400 });
  const categoryId = typeof body?.categoryId === "string" && body.categoryId ? String(body.categoryId) : null;
  if (categoryId) {
    const cat = await prisma.serverCategory.findUnique({ where: { id: categoryId } });
    if (!cat || cat.serverId !== params.serverId) return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }

  const count = await prisma.channel.count({ where: { serverId: params.serverId } });
  const channel = await prisma.channel.create({
    data: {
      name: parsed.data.name.toLowerCase(),
      type: parsed.data.type,
      topic: parsed.data.topic ?? "",
      serverId: params.serverId,
      categoryId,
      position: count,
    },
  });
  return NextResponse.json({ channel });
}
