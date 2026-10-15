import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { getAIUser } from "@/lib/ai";

/** Close (delete) a DM conversation for yourself. The other side keeps it only if they still have it — deletion is per-conversation here, both sides lose it. */
export async function DELETE(_req: Request, { params }: { params: { conversationId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const convo = await prisma.directConversation.findUnique({ where: { id: params.conversationId } });
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (convo.participantAId !== userId && convo.participantBId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Forced contact: the AI DM can never be closed.
  try {
    const ai = await getAIUser();
    if (ai && (convo.participantAId === ai.id || convo.participantBId === ai.id)) {
      return NextResponse.json({ error: "The AI conversation is pinned and can't be closed" }, { status: 400 });
    }
  } catch {
    /* ignore — fall through to normal delete */
  }
  await prisma.directConversation.delete({ where: { id: convo.id } });
  return NextResponse.json({ ok: true });
}
