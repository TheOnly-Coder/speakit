import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { newBotToken, newBotUsername, newBotShareCode } from "@/lib/bots/executor";
import { DEFAULT_BOT_CODE, isValidHexColor, isValidImageUrl } from "@/lib/bots/templates";
import { serializeDetail, serializeList } from "@/lib/bots/serializers";

const createSchema = z.object({
  name: z.string().min(2).max(32),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#5865f2"),
  avatarUrl: z.string().max(2048).optional().default(""),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bots = await prisma.bot.findMany({
    where: { ownerId: userId },
    include: {
      botUser: true,
      servers: { include: { server: { select: { id: true, name: true, iconColor: true, iconUrl: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ bots: bots.map(serializeList) });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const count = await prisma.bot.count({ where: { ownerId: userId } });
  if (count >= 10) {
    return NextResponse.json({ error: "Bot limit reached (10 per account)" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Give your bot a name (2–32 characters)" }, { status: 400 });
  }
  const name = parsed.data.name.trim();
  if (!isValidHexColor(parsed.data.avatarColor ?? "#5865f2")) {
    return NextResponse.json({ error: "Invalid avatar color" }, { status: 400 });
  }
  if (!isValidImageUrl(parsed.data.avatarUrl ?? "")) {
    return NextResponse.json({ error: "Avatar must be an http(s) image URL" }, { status: 400 });
  }

  const ids = newBotUsername();
  // The bot IS a user row so messages / members / mentions all just work.
  const botUser = await prisma.user.create({
    data: {
      authId: ids.authId,
      email: ids.email,
      username: ids.username,
      displayName: name,
      avatarColor: parsed.data.avatarColor ?? "#5865f2",
      avatarUrl: parsed.data.avatarUrl ?? "",
      status: "online",
      isBot: true,
      botOwnerId: userId,
    },
  });
  const bot = await prisma.bot.create({
    data: {
      ownerId: userId,
      userId: botUser.id,
      token: newBotToken(),
      shareCode: await uniqueShareCode(),
      code: DEFAULT_BOT_CODE,
    },
    include: { botUser: true, servers: true },
  });
  return NextResponse.json({ bot: serializeDetail(bot), token: bot.token, shareCode: bot.shareCode }, { status: 201 });
}

/** Generate a share code that isn't taken (retries on collision). */
async function uniqueShareCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newBotShareCode();
    const taken = await prisma.bot.findUnique({ where: { shareCode: code } });
    if (!taken) return code;
  }
  // Astronomically unlikely — fall back to a longer code.
  return `${newBotShareCode()}${newBotShareCode()}`;
}
