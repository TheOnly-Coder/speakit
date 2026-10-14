// Mirrors PERMISSIONS in lib/permissions.ts. Kept in a separate, import-free file
// so client components can use it without bundling the server's Prisma client.
const ALL_PERMS = [
  "manageChannels",
  "manageRoles",
  "manageServer",
  "manageMessages",
  "managePins",
  "kickMembers",
  "banMembers",
  "manageEmoji",
] as const;

export type PermView = {
  ownerId: string;
  roles: { id: string; permissions: string[] }[];
  members: { id: string; role: string; roleIds: string[] }[];
};

/** Client-safe: union of a member's role permissions (owner gets everything). */
export function myServerPerms(detail: PermView, userId: string | undefined): Set<string> {
  if (!userId) return new Set();
  const me = detail.members.find((m) => m.id === userId);
  if (!me) return new Set();
  if (detail.ownerId === userId || me.role === "owner") return new Set<string>([...ALL_PERMS]);
  const perms = new Set<string>();
  for (const role of detail.roles) {
    if (me.roleIds.includes(role.id)) {
      for (const p of role.permissions) perms.add(p);
    }
  }
  return perms;
}
