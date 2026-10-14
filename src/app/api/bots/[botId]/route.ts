import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { requireOwnedBot } from "@/lib/bots/executor";
import { MAX_BOT_CODE_LENGTH, isValidHexColor, isValidImageUrl, validateCommands } from "@/lib/bots/templates";
import { serializeDetail } from "@/lib/bots/serializers";

const patchSchema = z.object({
  name: z.string().min(2).max(32).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  avatarUrl: z.string().max(2048).optional(),
  code: z.string().max(MAX_BOT_CODE_LENGTH).optional(),
  enabled: z.boolean().optional(),
  commands: z.array(z.object({ name: z.string(), description: z.string().optional().default("") })).max(12).optional(),
});

export async function GET(_req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  return NextResponse.json({ bot: serializeDetail(bot) });
}

export async function PATCH(req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid bot settings" }, { status: 400 });

  const userPatch: Record<string, string> = {};
  if (parsed.data.name !== undefined) userPatch.displayName = parsed.data.name.trim();
  if (parsed.data.avatarColor !== undefined) {
    if (!isValidHexColor(parsed.data.avatarColor)) {
      return NextResponse.json({ error: "Invalid avatar color" }, { status: 400 });
    }
    userPatch.avatarColor = parsed.data.avatarColor;
  }
  if (parsed.data.avatarUrl !== undefined) {
    if (!isValidImageUrl(parsed.data.avatarUrl.trim())) {
      return NextResponse.json({ error: "Avatar must be an http(s) image URL or empty" }, { status: 400 });
    }
    userPatch.avatarUrl = parsed.data.avatarUrl.trim();
  }
  if (Object.keys(userPatch).length > 0) {
    await prisma.user.update({ where: { id: bot.userId }, data: userPatch });
  }

  const botPatch: Record<string, unknown> = {};
  if (parsed.data.code !== undefined) botPatch.code = parsed.data.code;
  if (parsed.data.enabled !== undefined) botPatch.enabled = parsed.data.enabled;
  if (parsed.data.commands !== undefined) {
    const checked = validateCommands(parsed.data.commands);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    botPatch.commands = JSON.stringify(checked.value);
  }
  // Saving good code clears the last error so the health badge goes green.
  if (parsed.data.code !== undefined) botPatch.lastError = "";
  if (Object.keys(botPatch).length > 0) {
    await prisma.bot.update({ where: { id: bot.id }, data: botPatch });
  }

  const fresh = await requireOwnedBot(userId, params.botId);
  return NextResponse.json({ bot: serializeDetail(fresh!) });
}

export async function DELETE(_req: Request, { params }: { params: { botId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bot = await requireOwnedBot(userId, params.botId);
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  // Deleting the bot's User row cascades: bot record, memberships, member-roles.
  // Bot-authored messages are removed with it (same as deleting any account).
  await prisma.bot.delete({ where: { id: bot.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: bot.userId } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
