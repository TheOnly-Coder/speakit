import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

const categorySchema = z.object({ name: z.string().min(1).max(32) });

export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(userId, params.serverId, "manageChannels"))) {
    return NextResponse.json({ error: "Missing permission: Manage channels" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  const count = await prisma.serverCategory.count({ where: { serverId: params.serverId } });
  const category = await prisma.serverCategory.create({
    data: { name: parsed.data.name.trim().slice(0, 32), serverId: params.serverId, position: count },
  });
  return NextResponse.json({ category });
}
