import { prisma } from "./db";

export const CHANNEL_PERMS = ["view", "send", "react", "connect"] as const;
export type ChannelPerm = (typeof CHANNEL_PERMS)[number];

function parseList(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function baseAllowed(type: string): Set<string> {
  // Default-open: channels are visible, writable and reactable unless restricted.
  if (type === "VOICE") return new Set(["view", "connect"]);
  return new Set(["view", "send", "react"]);
}

/**
 * Resolve a member's effective channel permissions.
 * Owner bypasses everything. @everyone overwrite applies first,
 * then each of the member's roles (deny wins over allow).
 */
export async function channelPermissions(
  userId: string,
  channel: { id: string; serverId: string; type: string }
): Promise<Set<string>> {
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
    include: { memberRoles: { include: { role: true } } },
  });
  if (!member) return new Set();
  if (member.role === "owner") return new Set(CHANNEL_PERMS);

  const overwrites = await prisma.channelOverwrite.findMany({ where: { channelId: channel.id } });
  const allowed = baseAllowed(channel.type);
  // Deny wins over allow: collect allows first, then apply denies so a deny
  // in ANY role (or @everyone) cannot be overridden by an allow elsewhere.
  const allows: string[][] = [];
  const denies: string[][] = [];
  const collect = (target: string) => {
    const ow = overwrites.find((o) => o.target === target);
    if (!ow) return;
    allows.push(parseList(ow.allow));
    denies.push(parseList(ow.deny));
  };
  collect("everyone");
  for (const mr of member.memberRoles) collect(mr.roleId);
  for (const list of allows) for (const p of list) allowed.add(p);
  for (const list of denies) for (const p of list) allowed.delete(p);
  return allowed;
}

export async function canInChannel(
  userId: string,
  channel: { id: string; serverId: string; type: string },
  perm: ChannelPerm
): Promise<boolean> {
  const perms = await channelPermissions(userId, channel);
  return perms.has(perm);
}

type LightChannel = { id: string; serverId: string; type: string };

/** Filter a channel list down to what a member may view (2 queries, no N+1). */
export async function visibleChannels<T extends LightChannel>(userId: string, serverId: string, channels: T[]): Promise<T[]> {
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    include: { memberRoles: { select: { roleId: true } } },
  });
  if (!member) return [];
  if (member.role === "owner") return channels;
  const roleIds = new Set(member.memberRoles.map((r) => r.roleId));
  const overwrites = await prisma.channelOverwrite.findMany({ where: { channelId: { in: channels.map((c) => c.id) } } });
  const byChannel = new Map<string, { target: string; allow: string[]; deny: string[] }[]>();
  for (const o of overwrites) {
    const list = byChannel.get(o.channelId) ?? [];
    list.push({ target: o.target, allow: parseList(o.allow), deny: parseList(o.deny) });
    byChannel.set(o.channelId, list);
  }
  return channels.filter((ch) => {
    const allowed = baseAllowed(ch.type);
    const ows = byChannel.get(ch.id) ?? [];
    // Deny wins over allow: applies first, denies second.
    for (const ow of ows) {
      if (ow.target === "everyone" || roleIds.has(ow.target)) {
        for (const p of ow.allow) allowed.add(p);
      }
    }
    for (const ow of ows) {
      if (ow.target === "everyone" || roleIds.has(ow.target)) {
        for (const p of ow.deny) allowed.delete(p);
      }
    }
    return allowed.has("view");
  });
}
