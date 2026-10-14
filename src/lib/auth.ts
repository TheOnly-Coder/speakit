import { prisma } from "./db";
import { createClient } from "./supabase-server";

/**
 * Session helpers (Supabase Auth backed).
 *
 * Our Prisma `User` profile rows are keyed by internal cuid `id` everywhere
 * (messages, memberships, ...). These helpers resolve the Supabase session to
 * that internal id, so the rest of the codebase is unchanged.
 */

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");
}

const AVATAR_COLORS = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#9b59b6", "#e67e22", "#1abc9c"];

export function avatarColorFor(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export type SessionProfile = {
  id: string;
  authId: string;
  email: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string;
};

export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await prisma.user.findUnique({ where: { authId: user.id } });
  if (!profile) return null;
  return {
    id: profile.id,
    authId: profile.authId,
    email: profile.email,
    username: profile.username,
    displayName: profile.displayName,
    avatarColor: profile.avatarColor,
    avatarUrl: profile.avatarUrl,
  };
}

/** Invite code every account is permanently part of (pinned first in the rail). */
export const FORCE_JOIN_CODE = process.env.FORCE_JOIN_CODE || "AU475QMS";

/** Silently adds a user to the forced home server (respects bans). */
export async function ensureForceJoin(userId: string): Promise<void> {
  try {
    const server = await prisma.server.findUnique({ where: { inviteCode: FORCE_JOIN_CODE } });
    if (!server) return;
    const [member, banned] = await Promise.all([
      prisma.serverMember.findUnique({ where: { userId_serverId: { userId, serverId: server.id } } }),
      prisma.ban.findUnique({ where: { serverId_userId: { serverId: server.id, userId } } }),
    ]);
    if (member || banned) return;
    await prisma.serverMember.create({ data: { userId, serverId: server.id, role: "member" } });
  } catch {
    /* never block auth on this */
  }
}

export async function requireUserId(): Promise<string> {
  const id = await getSessionUserId();
  if (!id) throw new Error("Unauthorized");
  return id;
}

/** Internal profile id for the logged-in user (used as FK across the app). */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getSessionProfile();
  return session?.id ?? null;
}
