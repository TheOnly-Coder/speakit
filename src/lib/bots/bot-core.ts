/**
 * Speakit Bots — isolated worker source.
 *
 * Bot code runs inside a `worker_threads` Worker (eval'd from
 * BOT_WORKER_SOURCE) so a stuck bot — e.g. `while (true) {}` in a handler,
 * which the `vm` timeout cannot preempt — can never hang the main server:
 * the parent just terminates the worker after a hard timeout.
 *
 * This function MUST stay fully self-contained: it is serialized with
 * `.toString()` and evaluated in a bare worker. No imports, no closure
 * variables, no references to anything outside its own body. All limits are
 * hardcoded here (keep in sync with templates.ts).
 */
export function botWorkerMain(): void {
  // Indirect eval: invisible to bundlers, available in the worker (CJS).
  const nodeRequire = (0, eval)("require") as (id: string) => unknown;
  const threads = nodeRequire("node:worker_threads") as {
    parentPort?: { postMessage(v: unknown): void } | null;
    workerData: { code: unknown; msg: unknown; store: unknown };
  };
  const vm = nodeRequire("node:vm") as {
    createContext(sandbox: unknown, options?: unknown): unknown;
    Script: new (code: string, options?: unknown) => {
      runInContext(context: unknown, options?: unknown): unknown;
    };
  };

  const MAX_MSG = 500;
  const MAX_ACTIONS = 5;

  const done = (result: unknown) => {
    try {
      threads.parentPort?.postMessage(result);
    } catch {
      /* parent is gone — nothing to do */
    }
  };

  const fail = (store: Record<string, unknown>, error: string, logs: string[]) => {
    done({ actions: [], logs, error: String(error).slice(0, 500), store });
  };

  (async () => {
    const logs: string[] = [];
    const actions: Array<Record<string, unknown>> = [];
    const log = (...parts: unknown[]) => {
      logs.push(
        parts
          .map((v) => {
            if (typeof v === "string") return v;
            try {
              const s = JSON.stringify(v);
              return typeof s === "string" ? s.slice(0, 1000) : String(v);
            } catch {
              return String(v);
            }
          })
          .join(" ")
          .slice(0, 2000)
      );
      if (logs.length > 50) logs.shift();
    };

    try {
      const input = threads.workerData ?? {};
      const code = String((input as { code?: unknown }).code ?? "");
      const msg = (input as { msg?: unknown }).msg as {
        id: unknown;
        content: unknown;
        author: { id: unknown; username: unknown; displayName: unknown; isBot: unknown };
        channel: { id: unknown; name: unknown; serverId: unknown };
        server: { id: unknown; name: unknown };
        mentionsMe: unknown;
        bot: { id: unknown; userId: unknown; name: unknown };
      };
      const rawStore = (input as { store?: unknown }).store as Record<string, unknown> | null;
      const storeData: Record<string, unknown> = { ...(rawStore && typeof rawStore === "object" ? rawStore : {}) };

      if (!msg || typeof msg !== "object") {
        fail(storeData, "bad trigger", logs);
        return;
      }

      const cleanText = (v: unknown): string => String(v ?? "").trim().slice(0, MAX_MSG);
      const pushAction = (a: Record<string, unknown>) => {
        if (actions.length >= MAX_ACTIONS) return;
        actions.push(a);
      };

      const msgForBot = Object.freeze({
        id: String(msg.id),
        content: String(msg.content ?? "").slice(0, MAX_MSG),
        author: Object.freeze({
          id: String(msg.author?.id ?? ""),
          username: String(msg.author?.username ?? ""),
          displayName: String(msg.author?.displayName ?? ""),
          isBot: !!msg.author?.isBot,
        }),
        channel: Object.freeze({
          id: String(msg.channel?.id ?? ""),
          name: String(msg.channel?.name ?? ""),
          serverId: String(msg.channel?.serverId ?? ""),
        }),
        server: Object.freeze({
          id: String(msg.server?.id ?? ""),
          name: String(msg.server?.name ?? ""),
        }),
        mentionsMe: !!msg.mentionsMe,
      });

      const storeForBot = {
        get: (key: unknown) => storeData[String(key ?? "")],
        set: (key: unknown, value: unknown) => {
          const k = String(key ?? "").slice(0, 128);
          if (!k) return;
          const s = JSON.stringify(value);
          if (!s || s.length > 4000) throw new Error("store.set: value must be JSON-serializable under 4KB");
          storeData[k] = JSON.parse(s) as unknown;
          if (Object.keys(storeData).length > 100) throw new Error("store: 100 keys max per bot");
        },
        remove: (key: unknown) => {
          delete storeData[String(key ?? "")];
        },
        all: () => ({ ...storeData }),
      };

      const apiForBot = {
        send: async (content: unknown, channelId?: unknown) => {
          const text = cleanText(content);
          if (!text) throw new Error("api.send: message cannot be empty");
          const target =
            typeof channelId === "string" && channelId ? channelId.slice(0, 64) : String(msgForBot.channel.id);
          pushAction({ kind: "send", channelId: target, content: text });
        },
        say: async (content: unknown, channelId?: unknown) =>
          (apiForBot.send as (c: unknown, ch?: unknown) => Promise<void>)(content, channelId),
        reply: async (content: unknown) => {
          const text = cleanText(content);
          if (!text) throw new Error("api.reply: message cannot be empty");
          pushAction({ kind: "reply", content: text, replyToId: String(msgForBot.id) });
        },
        react: async (emoji: unknown) => {
          const e = String(emoji ?? "").slice(0, 64);
          if (!e) throw new Error("api.react: emoji cannot be empty");
          pushAction({ kind: "react", messageId: String(msgForBot.id), emoji: e });
        },
      };

      const httpGet = async (url: string, asJson: boolean): Promise<unknown> => {
        let parsed: URL;
        try {
          parsed = new URL(String(url));
        } catch {
          throw new Error("http: invalid URL");
        }
        if (parsed.protocol !== "https:") throw new Error("http: https URLs only");
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        try {
          const res = await fetch(parsed.toString(), {
            signal: ctrl.signal,
            headers: { "User-Agent": "SpeakitBot/1.0" },
            redirect: "follow",
          });
          if (!res.ok) throw new Error(`http: upstream responded ${res.status}`);
          const text = await res.text();
          if (text.length > 200_000) throw new Error("http: response too large (200KB max)");
          if (!asJson) return text;
          try {
            return JSON.parse(text);
          } catch {
            throw new Error("http: response was not valid JSON");
          }
        } catch (e) {
          if ((e as Error)?.name === "AbortError") throw new Error("http: timed out after 6s");
          throw e instanceof Error ? e : new Error("http: request failed");
        } finally {
          clearTimeout(timer);
        }
      };

      const httpForBot = {
        getText: (url: unknown) => httpGet(String(url), false),
        getJson: (url: unknown) => httpGet(String(url), true),
      };

      const utilForBot = Object.freeze({
        dice: (sides: unknown) => {
          const s = Math.min(Math.max(parseInt(String(sides ?? "6"), 10) || 6, 2), 100);
          return 1 + Math.floor(Math.random() * s);
        },
        pick: (arr: unknown) => {
          if (!Array.isArray(arr) || arr.length === 0) return undefined;
          return arr[Math.floor(Math.random() * arr.length)];
        },
        includes: (haystack: unknown, needle: unknown) =>
          String(haystack ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase()),
        startsWithCommand: (text: unknown, cmd: unknown) => {
          const t = String(text ?? "").trim();
          const c = String(cmd ?? "").trim();
          return t === c || t.startsWith(c + " ");
        },
        cmd: (text: unknown, name: unknown) => {
          const t = String(text ?? "").trim();
          const n = String(name ?? "").trim().replace(/^[/!]/, "").toLowerCase();
          if (!n) return null;
          const lower = t.toLowerCase();
          for (const prefix of [`/${n}`, `!${n}`]) {
            if (lower === prefix) return "";
            if (lower.startsWith(prefix + " ")) return t.slice(prefix.length + 1);
          }
          return null;
        },
      });

      const botForBot = Object.freeze({
        id: String(msg.bot?.id ?? ""),
        userId: String(msg.bot?.userId ?? ""),
        name: String(msg.bot?.name ?? ""),
      });

      const handlers: Array<(m: unknown, a: unknown) => unknown> = [];
      const sandbox: Record<string, unknown> = {
        onMessage: (fn: unknown) => {
          if (typeof fn !== "function") throw new Error("onMessage(handler) needs a function");
          if (handlers.length >= 4) throw new Error("onMessage: max 4 handlers per bot");
          handlers.push(fn as (m: unknown, a: unknown) => unknown);
        },
        msg: msgForBot,
        api: apiForBot,
        store: storeForBot,
        http: httpForBot,
        util: utilForBot,
        bot: botForBot,
        console: { log, info: log, warn: log, error: log },
      };
      for (const k of [
        "process", "require", "module", "fetch", "setTimeout", "setInterval",
        "clearTimeout", "clearInterval", "global", "globalThis", "__dirname", "__filename",
      ]) {
        sandbox[k] = undefined;
      }

      const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
          void p.then(
            (v) => {
              clearTimeout(t);
              resolve(v);
            },
            (e) => {
              clearTimeout(t);
              reject(e);
            }
          );
        });
      };

      const context = vm.createContext(sandbox, {
        name: "speakit-bot",
        codeGeneration: { strings: false, wasm: false },
      });
      const script = new vm.Script(code, { filename: "bot.js" });
      script.runInContext(context, { timeout: 800 });

      if (handlers.length === 0) {
        done({ actions: [], logs, error: null, store: storeData });
        return;
      }

      for (const h of handlers) {
        try {
          await withTimeout(
            Promise.resolve().then(() => h(msgForBot, apiForBot)),
            2500,
            "Bot handler"
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : "Handler failed";
          logs.push(`handler error: ${String(message).slice(0, 500)}`);
          done({ actions, logs, error: String(message).slice(0, 500), store: storeData });
          return;
        }
        if (actions.length >= MAX_ACTIONS) break;
      }
      done({ actions, logs, error: null, store: storeData });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Bot crashed";
      done({ actions: [], logs, error: String(message).slice(0, 500), store: {} });
    }
  })();
}

/**
 * Serialized worker entry — evaluated with `new Worker(src, { eval: true })`.
 *
 * NOTE: function bodies may carry bundler keepNames wrappers (`__name(...)`)
 * after transpilation; the polyfill below keeps the serialized source
 * self-contained no matter which toolchain compiled this module.
 */
export const BOT_WORKER_SOURCE = `const __name=(fn)=>fn;(${botWorkerMain.toString()})()`;
