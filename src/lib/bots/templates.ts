/**
 * Speakit Bots — starter templates + shared limits.
 *
 * Bot code runs on the server inside a small sandbox (see sandbox.ts).
 * The ONLY supported shape is:
 *
 *   onMessage(async (msg, api) => { ... })
 *
 * Everything below is plain JS the editor can insert with one click.
 */

export const MAX_BOT_CODE_LENGTH = 20_000;
export const MAX_BOT_NAME_LENGTH = 32;
export const MAX_BOT_ACTIONS_PER_RUN = 5;
export const MAX_BOT_MESSAGE_LENGTH = 500;
export const MAX_BOT_COMMANDS = 12;

export type BotCommand = { name: string; description: string };

const COMMAND_NAME = /^[a-z0-9_-]{1,24}$/;

/** Validate the owner's declared command list. Names are lowercased. */
export function validateCommands(input: unknown): { ok: true; value: BotCommand[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "commands must be a list" };
  if (input.length > MAX_BOT_COMMANDS) {
    return { ok: false, error: `Max ${MAX_BOT_COMMANDS} commands per bot` };
  }
  const seen = new Set<string>();
  const value: BotCommand[] = [];
  for (const item of input) {
    const rec = item as { name?: unknown; description?: unknown };
    const name = String(rec?.name ?? "").trim().toLowerCase();
    const description = String(rec?.description ?? "").trim().slice(0, 100);
    if (!COMMAND_NAME.test(name)) {
      return { ok: false, error: `Bad command name "${String(rec?.name ?? "").slice(0, 24)}" — use 1–24 chars: a–z 0–9 _ -` };
    }
    if (seen.has(name)) return { ok: false, error: `Duplicate command "${name}"` };
    seen.add(name);
    value.push({ name, description });
  }
  return { ok: true, value };
}

/** Parse the JSON commands column from the DB (never throws). */
export function parseCommands(raw: unknown): BotCommand[] {
  try {
    const v = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    if (!Array.isArray(v)) return [];
    const out: BotCommand[] = [];
    for (const item of v) {
      const rec = item as { name?: unknown; description?: unknown };
      const name = String(rec?.name ?? "").trim().toLowerCase();
      if (!COMMAND_NAME.test(name)) continue;
      if (out.some((c) => c.name === name)) continue;
      out.push({ name, description: String(rec?.description ?? "").slice(0, 100) });
      if (out.length >= MAX_BOT_COMMANDS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export const DEFAULT_BOT_CODE = `// Welcome to SpeakIt bots!
// This code runs on the server every time someone talks
// in a server your bot was added to. See the "API Docs" tab
// for the full reference (msg, api, store, http, util).
//
// COMMANDS: declare commands below in the "Commands" section
// (e.g. ping, roll, count). People run them with "/" and pick
// them from the autocomplete menu — the "/" menu inserts
// "/ping", and util.cmd matches BOTH "/ping" and "!ping".

onMessage(async (msg, api) => {
  // Ignore other bots so bots never reply to each other in a loop.
  if (msg.author.isBot) return;

  const text = msg.content.trim();

  // 1) Simple command: /ping or !ping
  if (util.cmd(text, "ping") !== null) {
    await api.reply("Pong!");
    return;
  }

  // 2) Dice roller: /roll 20  (the args after the command are returned)
  const rollArgs = util.cmd(text, "roll");
  if (rollArgs !== null) {
    const sides = parseInt(rollArgs.split(/\\s+/)[0] || "6", 10) || 6;
    const roll = 1 + Math.floor(Math.random() * Math.min(Math.max(sides, 2), 100));
    await api.reply("Rolled d" + sides + ": **" + roll + "**");
    return;
  }

  // 3) Counter with persistent memory (survives restarts): /count
  if (util.cmd(text, "count") !== null) {
    const n = (store.get("count") || 0) + 1;
    store.set("count", n);
    await api.reply("This server has counted to **" + n + "**");
    return;
  }

  // 4) No declared command matched? Just be friendly when mentioned.
  if (msg.mentionsMe && /\\b(hi|hello|hey)\\b/i.test(text)) {
    await api.reply("Hey " + msg.author.displayName + "! Type \`/\` to see my commands.");
  }
});
`;

export const BOT_EXAMPLES: { id: string; label: string; hint: string; code: string }[] = [
  {
    id: "welcome",
    label: "Welcome greeter",
    hint: "Greets people who say hi to the bot",
    code: `onMessage(async (msg, api) => {
  if (msg.author.isBot) return;
  if (msg.mentionsMe && /\\b(hi|hello|hey|welcome)\\b/i.test(msg.content)) {
    await api.reply("Welcome, " + msg.author.displayName + "! :wave:");
  }
});`,
  },
  {
    id: "poll",
    label: "Quick poll",
    hint: "/poll cats or dogs",
    code: `onMessage(async (msg, api) => {
  if (msg.author.isBot) return;
  const args = util.cmd(msg.content, "poll");
  if (args === null) return;
  const question = args.trim() || "Yes or no?";
  await api.send("**Poll:** " + question + "\\nReact :one: / :two: to vote!");
  await api.react("1\\uFE0F\\u20E3");
});`,
  },
  {
    id: "karma",
    label: "Karma counter",
    hint: "/thanks @user with memory",
    code: `onMessage(async (msg, api) => {
  if (msg.author.isBot) return;
  const args = util.cmd(msg.content, "thanks");
  if (args !== null) {
    const who = args.split(/\\s+/)[0] || "someone";
    const key = "karma:" + who.toLowerCase();
    const n = (store.get(key) || 0) + 1;
    store.set(key, n);
    await api.reply(who + " now has **" + n + "** karma.");
    return;
  }
  if (util.cmd(msg.content, "karma") !== null) {
    await api.reply("Give karma with \`/thanks @name\`.");
  }
});`,
  },
  {
    id: "joke",
    label: "HTTP joke bot",
    hint: "Fetches from a public API",
    code: `onMessage(async (msg, api) => {
  if (msg.author.isBot) return;
  if (util.cmd(msg.content, "joke") === null) return;
  try {
    const joke = await http.getJson("https://official-joke-api.appspot.com/random_joke");
    await api.reply(joke.setup + " — *" + joke.punchline + "*");
  } catch (e) {
    await api.reply("No jokes right now, the internet sneezed.");
  }
});`,
  },
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(v: string): boolean {
  return HEX_COLOR.test(v);
}

export function isValidImageUrl(v: string): boolean {
  if (v === "") return true;
  if (v.length > 2048) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
