import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { sortedPair } from "@/lib/utils";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const convos = await prisma.directConversation.findMany({
    where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
    include: {
      participantA: true,
      participantB: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
  const mapped = convos.map((c) => {
    const other = c.participantAId === userId ? c.participantB : c.participantA;
    return {
      id: c.id,
      other: { id: other.id, username: other.username, displayName: other.displayName, avatarColor: other.avatarColor, avatarUrl: other.avatarUrl, status: other.status },
      lastMessage: c.messages[0]?.content ?? "",
      lastAt: c.messages[0]?.createdAt ?? c.updatedAt,
    };
  });
  return NextResponse.json({ conversations: mapped });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const otherId = String(body?.userId ?? "");
  if (!otherId || otherId === userId) return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  const other = await prisma.user.findUnique({ where: { id: otherId } });
  if (!other) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [a, b] = sortedPair(userId, otherId);
  let convo = await prisma.directConversation.findUnique({ where: { participantAId_participantBId: { participantAId: a, participantBId: b } } });
  if (!convo) {
    convo = await prisma.directConversation.create({ data: { participantAId: a, participantBId: b } });
  }
  return NextResponse.json({ conversationId: convo.id });
}
