import { parseCommands } from "./templates";

export type BotListRow = {
  id: string;
  enabled: boolean;
  shareCode: string;
  commands: string;
  lastRunAt: Date | null;
  lastError: string;
  createdAt: Date;
  botUser: { id: string; username: string; displayName: string; avatarColor: string; avatarUrl: string };
  servers: { server: { id: string; name: string } }[];
};

export function serializeList(bot: BotListRow): unknown {
  return {
    id: bot.id,
    userId: bot.botUser.id,
    name: bot.botUser.displayName,
    username: bot.botUser.username,
    avatarColor: bot.botUser.avatarColor,
    avatarUrl: bot.botUser.avatarUrl,
    enabled: bot.enabled,
    shareCode: bot.shareCode,
    commands: parseCommands(bot.commands),
    lastRunAt: bot.lastRunAt,
    lastError: bot.lastError,
    createdAt: bot.createdAt,
    serverCount: bot.servers.length,
    servers: bot.servers.map((s) => s.server),
  };
}

export type BotDetailRow = {
  id: string;
  token: string;
  shareCode: string;
  commands: string;
  code: string;
  store: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastError: string;
  createdAt: Date;
  updatedAt: Date;
  botUser: { id: string; username: string; displayName: string; avatarColor: string; avatarUrl: string };
  servers: unknown;
};

export function serializeDetail(bot: BotDetailRow): unknown {
  return {
    id: bot.id,
    userId: bot.botUser.id,
    name: bot.botUser.displayName,
    username: bot.botUser.username,
    avatarColor: bot.botUser.avatarColor,
    avatarUrl: bot.botUser.avatarUrl,
    enabled: bot.enabled,
    code: bot.code,
    // Token prefix only — the full token is shown once at creation /
    // regeneration and otherwise stays secret.
    tokenHint: `…${bot.token.slice(-6)}`,
    shareCode: bot.shareCode,
    commands: parseCommands(bot.commands),
    storeKeys: storeKeyList(bot.store),
    lastRunAt: bot.lastRunAt,
    lastError: bot.lastError,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    servers: (bot.servers as { server: unknown }[]).map((s) => s.server),
  };
}

function storeKeyList(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    if (v && typeof v === "object") return Object.keys(v).slice(0, 100);
    return [];
  } catch {
    return [];
  }
}
