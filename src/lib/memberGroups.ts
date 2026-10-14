import type { MemberItem, RoleItem } from "@/store/useAppStore";

/**
 * Shared role-display logic (Yapper/Discord style):
 * - a member's display color comes from their highest-positioned role
 *   that has a real (non-default) color
 * - the member list groups members by that top role, with role-less
 *   members in a trailing MEMBER group
 */

// Default "no color chosen" values — fall through to white instead.
const NO_COLORS = new Set(["#99aab5", "#000000", "#000"]);

export function isColored(color: string | null | undefined): boolean {
  return !!color && !NO_COLORS.has(color.toLowerCase());
}

type RoleRef = { roleIds: string[] };

/** Highest role (roles are already ordered by position, highest first). */
export function topRoleFor(member: RoleRef, roles: RoleItem[]): RoleItem | null {
  for (const r of roles) {
    if (member.roleIds.includes(r.id)) return r;
  }
  return null;
}

/** Username color: highest role with a real color, else null (= white). */
export function displayColorFor(member: RoleRef, roles: RoleItem[]): string | null {
  for (const r of roles) {
    if (member.roleIds.includes(r.id) && isColored(r.color)) return r.color;
  }
  return null;
}

export type MemberGroup = {
  key: string;
  name: string;
  color: string | null;
  members: MemberItem[];
};

function statusRank(status: string): number {
  switch (status) {
    case "online":
      return 0;
    case "idle":
      return 1;
    case "dnd":
      return 2;
    default:
      return 3;
  }
}

function byStatusThenName(a: MemberItem, b: MemberItem): number {
  const s = statusRank(a.status) - statusRank(b.status);
  if (s !== 0) return s;
  return a.displayName.localeCompare(b.displayName);
}

/**
 * Groups members by top role (each member appears once), roles keep their
 * position order. Owners with no roles get their own top group; everyone
 * else without roles lands in MEMBER at the bottom.
 */
export function groupMembers(
  members: MemberItem[],
  roles: RoleItem[],
  opts?: { ownerId?: string }
): MemberGroup[] {
  const groups: MemberGroup[] = [];
  const placed = new Set<string>();

  const ownerId = opts?.ownerId;
  if (ownerId) {
    const owner = members.find((m) => m.id === ownerId);
    if (owner && topRoleFor(owner, roles) === null) {
      groups.push({ key: "__owner", name: "Owner", color: null, members: [owner] });
      placed.add(owner.id);
    }
  }

  for (const role of roles) {
    const bucket = members
      .filter((m) => !placed.has(m.id) && topRoleFor(m, roles)?.id === role.id)
      .sort(byStatusThenName);
    if (bucket.length === 0) continue;
    for (const m of bucket) placed.add(m.id);
    groups.push({
      key: role.id,
      name: role.name,
      color: isColored(role.color) ? role.color : null,
      members: bucket,
    });
  }

  const rest = members.filter((m) => !placed.has(m.id)).sort(byStatusThenName);
  if (rest.length > 0) {
    groups.push({ key: "__member", name: "Member", color: null, members: rest });
  }
  return groups;
}
