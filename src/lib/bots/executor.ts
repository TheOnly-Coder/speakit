import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { runBotCode, parseStore, type BotAction, type BotTrigger } from "./sandbox";
import { canInChannel } from "../channelPerms";

/** Token shown ONCE to the owner, used as `Authorization: Bot <token>`. */
export function newBotToken(): string {
  return `spk_${randomBytes(24).toString("hex")}`;
}

const SHARE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Short public install code, e.g. "K7Q2MX9P" — safe to share anywhere. */
export function newBotShareCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += SHARE_ALPHABET[b % SHARE_ALPHABET.length];
  return out;
}

export function newBotUsername(): { username: string; authId: string; email: string } {
  const rand = randomBytes(8).toString("hex");
  return {
    username: `bot_${rand}`,
    authId: `bot_${rand}`,
    email: `bot_${rand}@bots.speakit.local`,
  };
}

export async function getBotByToken(token: string) {
  if (!token || !token.startsWith("spk_")) return null;
  return prisma.bot.findUnique({
    where: { token },
    include: { botUser: true, servers: true },
  });
}

export async function requireOwnedBot(ownerId: string, botId: string) {
  const bot = await prisma.bot.findUnique({
    where: { id: botId },
    include: { botUser: true, servers: { include: { server: { select: { id: true, name: true } } } } },
  });
  if (!bot || bot.ownerId !== ownerId) return null;
  return bot;
}

export function botMentionsMe(content: string, botUsername: string, botDisplayName: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes(`@${botUsername.toLowerCase()}`) ||
    lower.includes(`@${botDisplayName.toLowerCase()}`) ||
    lower.includes(botDisplayName.toLowerCase())
  );
}

export type ExecutedBotMessage = {
  id: string;
  content: string;
  channelId: string;
  createdAt: Date;
  replyToId: string | null;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl: string;
    isBot: boolean;
  };
};

/**
 * Run every enabled bot installed in `serverId` against a fresh user message,
 * persist each bot's store + last run state, write bot messages/reactions to
 * the DB and return what was created so the caller can broadcast it live.
 */
export async function handleBotTriggers(args: {
  messageId: string;
  content: string;
  authorId: string;
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
}): Promise<ExecutedBotMessage[]> {
  const out: ExecutedBotMessage[] = [];
  let bots;
  try {
    bots = await prisma.bot.findMany({
      where: { enabled: true, servers: { some: { serverId: args.serverId } } },
      include: { botUser: true },
    });
  } catch (e) {
    console.error("bot trigger lookup failed", e);
    return out;
  }
  // Bots never trigger other bots — this single rule prevents reply loops.
  const authorIsBot = bots.some((b) => b.userId === args.authorId);
  if (authorIsBot) return out;
  // Also ignore messages authored by ANY bot user (e.g. not installed here).
  if (!authorIsBot) {
    try {
      const author = await prisma.user.findUnique({
        where: { id: args.authorId },
        select: { isBot: true },
      });
      if (author?.isBot) return out;
    } catch {
      /* ignore */
    }
  }

  for (const bot of bots) {
    let result;
    try {
      const trigger: BotTrigger = {
        id: args.messageId,
        content: args.content,
        author: await resolveTriggerAuthor(args.authorId),
        channel: { id: args.channelId, name: args.channelName, serverId: args.serverId },
        server: { id: args.serverId, name: args.serverName },
        mentionsMe: botMentionsMe(args.content, bot.botUser.username, bot.botUser.displayName),
        bot: { id: bot.id, userId: bot.userId, name: bot.botUser.displayName },
      };
      result = await runBotCode({
        code: bot.code,
        msg: trigger,
        store: parseStore(bot.store),
      });
    } catch (e) {
      console.error("bot run failed", e);
      continue;
    }

    // Always record the run (success or error) so the owner can debug it.
    try {
      await prisma.bot.update({
        where: { id: bot.id },
        data: {
          store: JSON.stringify(result.store).slice(0, 50_000),
          lastRunAt: new Date(),
          lastError: result.error ?? "",
        },
      });
    } catch {
      /* non-fatal */
    }

    for (const action of result.actions.slice(0, 5)) {
      try {
        const created = await executeBotAction(bot.id, bot.userId, args.serverId, action);
        if (created) out.push(created);
      } catch (e) {
        console.error("bot action failed", e);
      }
    }
  }
  return out;
}

async function resolveTriggerAuthor(authorId: string): Promise<BotTrigger["author"]> {
  try {
    const u = await prisma.user.findUnique({ where: { id: authorId } });
    if (!u) return { id: authorId, username: "unknown", displayName: "Unknown", isBot: false };
    return { id: u.id, username: u.username, displayName: u.displayName, isBot: !!u.isBot };
  } catch {
    return { id: authorId, username: "unknown", displayName: "Unknown", isBot: false };
  }
}

async function executeBotAction(
  botId: string,
  botUserId: string,
  triggerServerId: string,
  action: BotAction
): Promise<ExecutedBotMessage | null> {
  if (action.kind === "react") {
    const target = await prisma.message.findUnique({
      where: { id: action.messageId },
      include: { channel: { select: { serverId: true } } },
    });
    if (!target || target.channel.serverId !== triggerServerId) return null;
    const emoji = String(action.emoji).slice(0, 64);
    if (!emoji) return null;
    try {
      await prisma.reaction.upsert({
        where: { messageId_userId_emoji: { messageId: target.id, userId: botUserId, emoji } },
        create: { messageId: target.id, userId: botUserId, emoji },
        update: {},
      });
    } catch {
      return null;
    }
    return null; // reactions broadcast via the normal reaction path on next toggle; no message created
  }

  const content = String(action.content).trim().slice(0, 500);
  if (!content) return null;

  if (action.kind === "reply") {
    const target = await prisma.message.findUnique({
      where: { id: action.replyToId },
      include: { channel: { select: { id: true, serverId: true, type: true } } },
    });
    if (!target || target.channel.serverId !== triggerServerId) return null;
    if (!(await canInChannel(botUserId, target.channel, "view"))) return null;
    if (!(await canInChannel(botUserId, target.channel, "send"))) return null;
    const created = await prisma.message.create({
      data: { content, channelId: target.channel.id, authorId: botUserId, replyToId: target.id },
      include: { author: true },
    });
    void prisma.bot.update({ where: { id: botId }, data: { lastRunAt: new Date() } }).catch(() => {});
    return toExecuted(created.channelId, created, null);
  }

  // send
  const channel = await prisma.channel.findUnique({ where: { id: action.channelId } });
  if (!channel || channel.type !== "TEXT") return null;
  // The bot must be installed in the target channel's server.
  const install = await prisma.botServer.findUnique({
    where: { botId_serverId: { botId, serverId: channel.serverId } },
  });
  if (!install) return null;
  // The bot user must still be a member there (repaired on install).
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: botUserId, serverId: channel.serverId } },
  });
  if (!member) return null;
  // Bots obey channel overwrites like everyone else.
  if (!(await canInChannel(botUserId, channel, "view"))) return null;
  if (!(await canInChannel(botUserId, channel, "send"))) return null;
  const created = await prisma.message.create({
    data: { content, channelId: channel.id, authorId: botUserId },
    include: { author: true },
  });
  return toExecuted(created.channelId, created, null);
}

function toExecuted(
  channelId: string,
  created: {
    id: string;
    content: string;
    createdAt: Date;
    author: { id: string; username: string; displayName: string; avatarColor: string; avatarUrl: string };
  },
  replyToId: string | null
): ExecutedBotMessage {
  return {
    id: created.id,
    content: created.content,
    channelId,
    createdAt: created.createdAt,
    replyToId,
    author: {
      id: created.author.id,
      username: created.author.username,
      displayName: created.author.displayName,
      avatarColor: created.author.avatarColor,
      avatarUrl: created.author.avatarUrl,
      isBot: true,
    },
  };
}

/** Ensure the bot's User row is a member of the server (idempotent). */
export async function ensureBotMembership(botUserId: string, serverId: string): Promise<void> {
  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: botUserId, serverId } },
    create: { userId: botUserId, serverId, role: "member" },
    update: {},
  });
}
