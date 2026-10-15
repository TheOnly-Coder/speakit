import { prisma } from "./db";

// Full Discord-like role permissions, de-duplicated from the product screenshots.
// (Kick/Ban/Timeout + text perms appeared in both screenshots — listed once here.)
export const PERMISSIONS = [
  "manageChannels",
  "manageRoles",
  "manageEmoji",
  "manageServer",
  "createInvite",
  "changeNickname",
  "manageNicknames",
  "kickMembers",
  "banMembers",
  "timeoutMembers",
  "sendMessages",
  "embedLinks",
  "attachFiles",
  "addReactions",
  "useExternalEmoji",
  "createPolls",
  "mentionEveryone",
  "manageMessages",
  "readMessageHistory",
  "connect",
  "speak",
  "muteMembers",
  "moveMembers",
  "administrator",
  // Legacy: predates the full list. Kept so old roles still work; pinning now
  // also accepts `manageMessages` (see memberPermissions below).
  "managePins",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  manageChannels: "Manage Channels",
  manageRoles: "Manage Roles",
  manageEmoji: "Manage Emoji",
  manageServer: "Manage Server",
  createInvite: "Create Invite",
  changeNickname: "Change Nickname",
  manageNicknames: "Manage Nicknames",
  kickMembers: "Kick Members",
  banMembers: "Ban Members",
  timeoutMembers: "Timeout Members",
  sendMessages: "Send Messages",
  embedLinks: "Embed Links",
  attachFiles: "Attach Files",
  addReactions: "Add Reactions",
  useExternalEmoji: "Use External Emoji",
  createPolls: "Create Polls",
  mentionEveryone: "Mention @everyone",
  manageMessages: "Manage Messages",
  readMessageHistory: "Read Message History",
  connect: "Connect",
  speak: "Speak",
  muteMembers: "Mute Members",
  moveMembers: "Move Members",
  administrator: "Administrator",
  managePins: "Manage Pins",
};

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  manageChannels: "Create, edit, reorder and delete channels.",
  manageRoles: "Create and edit roles below their own, and give them to people.",
  manageEmoji: "Add and remove server emojis.",
  manageServer: "Change the server's name, icon, banner and settings.",
  createInvite: "Invite people to the server.",
  changeNickname: "Change their own nickname.",
  manageNicknames: "Change other people's nicknames.",
  kickMembers: "Remove people; they can rejoin with an invite.",
  banMembers: "Remove people for good (until unbanned).",
  timeoutMembers: "Stop someone from talking for a while.",
  sendMessages: "Post in text channels.",
  embedLinks: "Post links.",
  attachFiles: "Upload pictures, videos and audio.",
  addReactions: "React to messages.",
  useExternalEmoji: "Use emoji from other servers.",
  createPolls: "Start polls.",
  mentionEveryone: "Ping the whole server.",
  manageMessages: "Delete and pin anyone's messages. Moderator stuff.",
  readMessageHistory: "See messages sent before they were around.",
  connect: "Join voice channels.",
  speak: "Talk in voice channels.",
  muteMembers: "Mute other people in voice.",
  moveMembers: "Disconnect people from voice.",
  administrator: "Every permission, and bypasses channel restrictions. Dangerous.",
  managePins: "Pin and unpin messages (legacy — Manage Messages also covers this).",
};

export const PERMISSION_CATEGORIES: { title: string; perms: Permission[] }[] = [
  {
    title: "General Server Permissions",
    perms: ["manageChannels", "manageRoles", "manageEmoji", "manageServer", "createInvite", "changeNickname", "manageNicknames"],
  },
  {
    title: "Membership Permissions",
    perms: ["kickMembers", "banMembers", "timeoutMembers"],
  },
  {
    title: "Text Channel Permissions",
    perms: ["sendMessages", "embedLinks", "attachFiles", "addReactions", "useExternalEmoji", "createPolls", "mentionEveryone", "manageMessages", "readMessageHistory"],
  },
  {
    title: "Voice Channel Permissions",
    perms: ["connect", "speak", "muteMembers", "moveMembers"],
  },
  {
    title: "Advanced Permissions",
    perms: ["administrator"],
  },
];

/** Role names that can never be created — reserved for virtual/system groups. */
export const RESERVED_ROLE_NAMES = ["offline", "@everyone", "everyone", "here"];

export function isReservedRoleName(name: string): boolean {
  return RESERVED_ROLE_NAMES.includes(name.trim().toLowerCase().replace(/^@/, ""));
}

/** Expand legacy aliases: Manage Messages implies the old Manage Pins. */
function expandAliases(perms: Set<string>): Set<string> {
  if (perms.has("manageMessages")) perms.add("managePins");
  return perms;
}

/** All permission strings held by a member (owners + Administrator get everything). */
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
  if (perms.has("administrator")) return new Set(PERMISSIONS);
  return expandAliases(perms);
}

export async function hasPermission(userId: string, serverId: string, perm: Permission): Promise<boolean> {
  const perms = await memberPermissions(userId, serverId);
  return perms.has(perm);
}

export async function isOwner(userId: string, serverId: string): Promise<boolean> {
  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
  return server?.ownerId === userId;
}
