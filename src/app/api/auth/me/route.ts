import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionProfile } from "@/lib/auth";
import { toSafeUser } from "@/lib/types";

export async function GET() {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({ user: toSafeUser(user) });
}
