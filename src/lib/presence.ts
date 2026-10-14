/**
 * Shared live-presence registry.
 *
 * IMPORTANT: the socket server (compiled to `.server/` by tsc) and the Next.js
 * API routes (bundled by webpack) each load their OWN copy of this module —
 * module-level `const`s are NOT shared between them even though everything
 * runs in a single Node process (single Render instance). So all state lives
 * on `globalThis.__speakit_presence` (same pattern as `__speakit_io_emit` in
 * bots/emit.ts): every copy reads/writes the same Maps, and `isLive()` /
 * `visibleStatus()` agree everywhere. Without this, API routes always see an
 * empty registry and EVERYONE reads as "offline" forever.
 *
 * Rules (Discord-like, automatic):
 * - A user is "live" while at least one socket is connected.
 * - Anyone NOT live reads as "offline" everywhere — member lists, friends,
 *   DMs, profile cards — no matter what their stored status says.
 * - "invisible" always reads as "offline" to everyone else (privacy).
 * - Otherwise the stored status (online / idle / dnd) is shown.
 */

type PresenceShared = {
  live: Map<string, Set<string>>; // userId -> socketIds
  idle: Set<string>; // userIds with an ephemeral auto-away overlay (see below)
};

function shared(): PresenceShared {
  const g = globalThis as unknown as { __speakit_presence?: PresenceShared };
  if (!g.__speakit_presence) {
    g.__speakit_presence = { live: new Map(), idle: new Set() };
  }
  return g.__speakit_presence;
}

/**
 * Ephemeral auto-away overlay (Discord-like idle).
 *
 * - Set when a client reports no input for IDLE_TIMEOUT_MS with the tab open.
 * - NEVER persisted to the DB: the stored status (online/dnd/…) stays intact,
 *   so coming back (or reconnecting) restores exactly what was there before.
 * - Only overlays `online` → `idle`. DND / invisible / manual-idle are kept.
 * - Cleared on manual status change, on fresh connect, and on full disconnect
 *   (offline takes precedence over idle).
 */

/** Mark a live user as auto-away. */
export function markAutoIdle(userId: string): void {
  shared().idle.add(userId);
}

/** Clear the auto-away flag. Returns true if the user was auto-idle. */
export function clearAutoIdle(userId: string): boolean {
  return shared().idle.delete(userId);
}

/** Whether the user is currently auto-away. */
export function isAutoIdle(userId: string): boolean {
  return shared().idle.has(userId);
}

/** Register a socket. Returns true if this is the user's first live socket. */
export function presenceOnline(userId: string, socketId: string): boolean {
  const liveSockets = shared().live;
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
  const liveSockets = shared().live;
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
  return shared().live.get(userId) ?? new Set();
}

/** Whether the user has any live connection right now. */
export function isLive(userId: string): boolean {
  return shared().live.has(userId);
}

/**
 * What everyone else should see for this user.
 * `stored` is the DB status: online | idle | dnd | invisible.
 */
export function visibleStatus(stored: string, userId: string): string {
  if (stored === "invisible") return "offline";
  if (!isLive(userId)) return "offline";
  // Auto-away only ever overlays `online` — DND / manual-idle stay as set,
  // and the stored value is untouched so return restores it exactly.
  if (stored === "online" && isAutoIdle(userId)) return "idle";
  if (stored === "online" || stored === "idle" || stored === "dnd") return stored;
  return "online";
}
