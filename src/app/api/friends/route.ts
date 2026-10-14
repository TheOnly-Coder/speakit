import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { normalizeUsername } from "@/lib/auth";
import { visibleStatus } from "@/lib/presence";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [sent, received] = await Promise.all([
    prisma.friendship.findMany({
      where: { requesterId: userId },
      include: { receiver: true, requester: true },
    }),
    prisma.friendship.findMany({
      where: { receiverId: userId },
      include: { receiver: true, requester: true },
    }),
  ]);

  const all = [...sent, ...received];
  const friends = all
    .filter((f) => f.status === "ACCEPTED")
    .map((f) => (f.requesterId === userId ? { peer: f.receiver, fr: f } : { peer: f.requester, fr: f }))
    .map(({ peer: u, fr }) => ({ id: u.id, friendshipId: fr.id, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl, status: visibleStatus(u.status, u.id) }));
  const pendingIn = received.filter((f) => f.status === "PENDING").map((f) => ({ id: f.id, user: { id: f.requester.id, username: f.requester.username, displayName: f.requester.displayName, avatarColor: f.requester.avatarColor, avatarUrl: f.requester.avatarUrl } }));
  const pendingOut = sent.filter((f) => f.status === "PENDING").map((f) => ({ id: f.id, user: { id: f.receiver.id, username: f.receiver.username, displayName: f.receiver.displayName, avatarColor: f.receiver.avatarColor, avatarUrl: f.receiver.avatarUrl } }));

  return NextResponse.json({ friends, pendingIn, pendingOut });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const raw = String(body?.username ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Username is required" }, { status: 400 });
  const username = normalizeUsername(raw);

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === userId) return NextResponse.json({ error: "You can't add yourself" }, { status: 400 });
  if (target.isBot) return NextResponse.json({ error: "That's a bot — add it to a server from User Settings → Bots" }, { status: 400 });

  const existingEither =
    (await prisma.friendship.findUnique({ where: { requesterId_receiverId: { requesterId: userId, receiverId: target.id } } })) ??
    (await prisma.friendship.findUnique({ where: { requesterId_receiverId: { requesterId: target.id, receiverId: userId } } }));
  if (existingEither) {
    if (existingEither.status === "ACCEPTED") return NextResponse.json({ error: "Already friends" }, { status: 409 });
    return NextResponse.json({ error: "Request already pending" }, { status: 409 });
  }

  const fr = await prisma.friendship.create({ data: { requesterId: userId, receiverId: target.id, status: "PENDING" } });
  return NextResponse.json({ request: fr, receiverId: target.id });
}
