import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { createChannelSchema } from "@/lib/validations";

export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: params.serverId } },
  });
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const body = await req.json();
  const parsed = createChannelSchema.safeParse({ ...body, serverId: params.serverId });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid channel" }, { status: 400 });

  const count = await prisma.channel.count({ where: { serverId: params.serverId } });
  const channel = await prisma.channel.create({
    data: {
      name: parsed.data.name.toLowerCase(),
      type: parsed.data.type,
      topic: parsed.data.topic ?? "",
      serverId: params.serverId,
      position: count,
    },
  });
  return NextResponse.json({ channel });
}
