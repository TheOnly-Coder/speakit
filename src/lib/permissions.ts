import { prisma } from "./db";

export const PERMISSIONS = [
  "manageChannels",
  "manageRoles",
  "manageServer",
  "manageMessages",
  "managePins",
  "kickMembers",
  "banMembers",
  "manageEmoji",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  manageChannels: "Manage channels",
  manageRoles: "Manage roles",
  manageServer: "Manage server",
  manageMessages: "Manage messages",
  managePins: "Manage pins",
  kickMembers: "Kick members",
  banMembers: "Ban members",
  manageEmoji: "Manage emoji",
};

/** All permission strings held by a member (owners get everything). */
export async function memberPermissions(userId: string, serverId: string): Promise<Set<string>> {
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    include: { memberRoles: { include: { role: true } } },
  });
  if (!member) return new Set();
  if (member.role === "owner") return new Set(PERMISSIONS);
  const perms = new Set<string>();
  for (const mr of member.memberRoles) {
    try {
      const list = JSON.parse(mr.role.permissions) as string[];
      for (const p of list) perms.add(p);
    } catch {
      /* ignore malformed role */
    }
  }
  return perms;
}

export async function hasPermission(userId: string, serverId: string, perm: Permission): Promise<boolean> {
  const perms = await memberPermissions(userId, serverId);
  return perms.has(perm);
}

export async function isOwner(userId: string, serverId: string): Promise<boolean> {
  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
  return server?.ownerId === userId;
}
