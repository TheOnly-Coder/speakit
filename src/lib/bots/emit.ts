/**
 * Live-broadcast helper shared by the socket server and Next API routes.
 *
 * server.ts sets `globalThis.__speakit_io_emit(channel, event, payload)`
 * once Socket.IO is up. API routes (bot HTTP API) call broadcast() which
 * no-ops when the socket layer isn't attached (same-process custom server
 * always attaches it, so bot messages appear live like normal messages).
 */

type Emitter = (room: string, event: string, payload: unknown) => void;

export function getIoEmitter(): Emitter | null {
  try {
    const fn = (globalThis as unknown as { __speakit_io_emit?: Emitter }).__speakit_io_emit;
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

export function broadcastChannelMessage(channelId: string, payload: unknown): void {
  try {
    getIoEmitter()?.(`channel:${channelId}`, "channel:message:new", payload);
  } catch {
    /* never break message creation on broadcast */
  }
}

export function broadcastReactions(channelId: string, payload: unknown): void {
  try {
    getIoEmitter()?.(`channel:${channelId}`, "message:reactions:updated", payload);
  } catch {
    /* ignore */
  }
}
