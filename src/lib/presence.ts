/**
 * Shared live-presence registry.
 *
 * IMPORTANT: this module holds in-process state shared by the Socket.IO
 * server (server.ts) and Next.js API routes. It works because the custom
 * server runs everything in a single Node process (single Render instance).
 *
 * Rules (Discord-like, automatic):
 * - A user is "live" while at least one socket is connected.
 * - Anyone NOT live reads as "offline" everywhere — member lists, friends,
 *   DMs, profile cards — no matter what their stored status says.
 * - "invisible" always reads as "offline" to everyone else (privacy).
 * - Otherwise the stored status (online / idle / dnd) is shown.
 */

const liveSockets = new Map<string, Set<string>>(); // userId -> socketIds

/** Register a socket. Returns true if this is the user's first live socket. */
export function presenceOnline(userId: string, socketId: string): boolean {
  let set = liveSockets.get(userId);
  if (!set) {
    set = new Set();
    liveSockets.set(userId, set);
  }
  const wasLive = set.size > 0;
  set.add(socketId);
  return !wasLive;
}

/** Unregister a socket. Returns true if the user just went fully offline. */
export function presenceOffline(userId: string, socketId: string): boolean {
  const set = liveSockets.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    liveSockets.delete(userId);
    return true;
  }
  return false;
}

/** All socket ids currently live for a user (for targeted emits). */
export function presenceSockets(userId: string): Set<string> {
  return liveSockets.get(userId) ?? new Set();
}

/** Whether the user has any live connection right now. */
export function isLive(userId: string): boolean {
  return liveSockets.has(userId);
}

/**
 * What everyone else should see for this user.
 * `stored` is the DB status: online | idle | dnd | invisible.
 */
export function visibleStatus(stored: string, userId: string): string {
  if (stored === "invisible") return "offline";
  if (!isLive(userId)) return "offline";
  if (stored === "online" || stored === "idle" || stored === "dnd") return stored;
  return "online";
}
