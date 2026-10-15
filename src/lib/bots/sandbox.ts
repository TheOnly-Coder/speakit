import { Worker } from "node:worker_threads";
import { BOT_WORKER_SOURCE } from "./bot-core";

/**
 * Speakit Bots sandbox (parent side).
 *
 * Bot code runs inside a short-lived `worker_threads` Worker (see bot-core.ts)
 * so a stuck bot can never hang the server: the parent terminates the worker
 * after a hard timeout and reports it as a bot error.
 *
 * Capabilities (enforced inside the worker): onMessage handlers, msg/api/
 * store/http/util only — no require/process/fetch/timers. Max 5 actions/run.
 * http covers GET (text/JSON) plus POST JSON via http.postJson(url, body).
 */

export type BotTriggerAuthor = {
  id: string;
  username: string;
  displayName: string;
  isBot: boolean;
};

export type BotTrigger = {
  id: string;
  content: string;
  author: BotTriggerAuthor;
  channel: { id: string; name: string; serverId: string };
  server: { id: string; name: string };
  mentionsMe: boolean;
  bot: { id: string; userId: string; name: string };
};

export type BotAction =
  | { kind: "send"; channelId: string; content: string }
  | { kind: "reply"; content: string; replyToId: string }
  | { kind: "react"; messageId: string; emoji: string };

export type BotRunResult = {
  actions: BotAction[];
  logs: string[];
  error: string | null;
  store: Record<string, unknown>;
};

const DEFAULT_TIMEOUT_MS = 15000;

function emptyResult(store: Record<string, unknown>, error: string): BotRunResult {
  return { actions: [], logs: [], error, store: { ...store } };
}

function normalizeResult(raw: unknown, fallbackStore: Record<string, unknown>): BotRunResult {
  try {
    const r = raw as { actions?: unknown; logs?: unknown; error?: unknown; store?: unknown };
    const actions = Array.isArray(r.actions)
      ? (r.actions as Record<string, unknown>[])
          .filter((a) => a && typeof a === "object")
          .map((a) => {
            if (a.kind === "reply") {
              return { kind: "reply" as const, content: String(a.content ?? ""), replyToId: String(a.replyToId ?? "") };
            }
            if (a.kind === "react") {
              return { kind: "react" as const, messageId: String(a.messageId ?? ""), emoji: String(a.emoji ?? "") };
            }
            return { kind: "send" as const, channelId: String(a.channelId ?? ""), content: String(a.content ?? "") };
          })
          .slice(0, 5)
      : [];
    const logs = Array.isArray(r.logs) ? r.logs.map((l) => String(l)).slice(0, 50) : [];
    const store =
      r.store && typeof r.store === "object" && !Array.isArray(r.store)
        ? (r.store as Record<string, unknown>)
        : { ...fallbackStore };
    return {
      actions,
      logs,
      error: r.error == null ? null : String(r.error).slice(0, 500),
      store,
    };
  } catch {
    return emptyResult(fallbackStore, "Bot returned garbage");
  }
}

export async function runBotCode(args: {
  code: string;
  msg: BotTrigger;
  store: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<BotRunResult> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fallbackStore = { ...args.store };

  let worker: Worker;
  try {
    worker = new Worker(BOT_WORKER_SOURCE, {
      eval: true,
      workerData: { code: String(args.code), msg: args.msg, store: args.store },
    });
  } catch {
    return emptyResult(fallbackStore, "Bot runtime unavailable");
  }

  return new Promise<BotRunResult>((resolve) => {
    let settled = false;
    const finish = (r: BotRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().catch(() => {});
      resolve(r);
    };
    const timer = setTimeout(() => {
      finish(emptyResult(fallbackStore, "Bot timed out and was killed"));
    }, timeoutMs);
    // Don't keep the process alive for a stray bot worker.
    (timer as unknown as { unref?: () => void }).unref?.();

    worker.on("message", (result: unknown) => finish(normalizeResult(result, fallbackStore)));
    worker.on("error", (e: Error) =>
      finish(emptyResult(fallbackStore, String(e?.message ?? e ?? "Bot crashed").slice(0, 500)))
    );
    worker.on("exit", (code: number) => {
      if (!settled) finish(emptyResult(fallbackStore, `Bot crashed (exit ${code})`));
    });
  });
}

/** Parse the persisted store JSON safely. */
export function parseStore(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}
