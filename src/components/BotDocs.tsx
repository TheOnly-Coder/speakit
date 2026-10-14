"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

function Code({ text, block, lang }: { text: string; block?: boolean; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  if (!block) {
    return <code className="rounded bg-white/10 px-1 py-px font-mono text-[12px] text-[#b5bdff]">{text}</code>;
  }
  return (
    <div className="group relative mb-3 overflow-hidden rounded-lg bg-[#111214] ring-1 ring-black/60">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase text-speakit-muted">{lang ?? "javascript"}</span>
        <button onClick={() => void copy()} className="flex items-center gap-1 text-[11px] text-speakit-muted hover:text-white">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-speakit-text">{text}</pre>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-5 text-sm font-black text-white">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[13px] leading-relaxed text-speakit-text">{children}</p>;
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="mb-3 overflow-hidden rounded-lg ring-1 ring-white/10">
      {rows.map(([k, v], i) => (
        <div key={k} className={`grid grid-cols-[140px_1fr] gap-2 px-3 py-1.5 text-[12px] ${i % 2 ? "bg-black/20" : "bg-black/40"}`}>
          <code className="font-mono text-[#b5bdff]">{k}</code>
          <span className="text-speakit-text">{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Complete bot documentation: in-site JavaScript API + external HTTP API.
 * Rendered in User Settings → Bots → API Docs and at /docs/bots.
 */
export function BotDocs() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <h2 className="mb-1 text-base font-black text-white">Bot API documentation</h2>
      <p className="mb-2 text-[13px] text-speakit-muted">
        Everything a SpeakIt bot can do: chat code that runs on the server, plus an HTTP API for outside scripts.
      </p>

      <H>1 · Quickstart (2 minutes)</H>
      <P>
        1. Open <Code text="User Settings → Bots" /> and press <Code text="Add a bot" /> — pick a name and picture.
        2. Declare commands like <Code text="ping" /> and <Code text="roll" /> in the Commands section.
        3. Paste the starter code (or an example), press <Code text="Save changes" />, then <Code text="Run" /> a test message like <Code text="/ping" />.
        4. Give a server manager your bot&apos;s <Code text="share code" /> — they paste it into <Code text="Server Settings → Bots" /> and your bot joins instantly.
        5. Type <Code text="/" /> in any channel: your commands pop up with autocomplete.
      </P>

      <H>2 · How bots see chat</H>
      <P>
        Your code runs <b>once per message</b> in every server the bot joined. Register handlers with{" "}
        <Code text="onMessage" />. Bots never see DMs, and bot messages never trigger bots (no reply loops).
        If the bot declares no commands, it still runs on every message — it just does whatever its code says.
      </P>
      <Code lang="javascript" block text={`onMessage(async (msg, api) => {
  if (msg.author.isBot) return;          // always keep this first line

  const args = util.cmd(msg.content, "roll");  // matches "/roll 20" AND "!roll 20"
  if (args !== null) {
    const sides = parseInt(args.split(/\\s+/)[0] || "6", 10) || 6;
    await api.reply("Rolled d" + sides + ": **" + util.dice(sides) + "**");
  }
});`} />

      <H>3 · The msg object</H>
      <Table rows={[
        ["msg.content", "Full message text (max 500 chars)."],
        ["msg.author", "{ id, username, displayName, isBot } — who sent it."],
        ["msg.channel", "{ id, name, serverId } — where it was sent."],
        ["msg.server", "{ id, name } — which server."],
        ["msg.mentionsMe", "true when the text mentions the bot (@username or name)."],
        ["msg.id", "The triggering message id (for api.react / replies)."],
        ["bot", "{ id, userId, name } — your own bot."],
      ]} />

      <H>4 · The api object (answering)</H>
      <P>Every handler gets <Code text="api" />. Calls are queued (max 5 per message) and posted as the bot, with the BOT tag.</P>
      <Table rows={[
        ["api.reply(text)", "Reply to the triggering message (creates the reply thread)."],
        ["api.send(text, channelId?)", "Send to the same channel — or another channel id in a server the bot joined. Alias: api.say."],
        ["api.react(emoji)", "React to the triggering message, e.g. api.react(\"👍\")."],
      ]} />
      <Code lang="javascript" block text={`onMessage(async (msg, api) => {
  if (msg.author.isBot) return;
  if (util.cmd(msg.content, "poll") !== null) {
    const q = util.cmd(msg.content, "poll") || "Yes or no?";
    await api.send("**Poll:** " + q);
    await api.react("👍");
  }
});`} />

      <H>5 · Memory with store</H>
      <P><Code text="store" /> is per-bot JSON memory that survives restarts — counters, karma, settings. 100 keys, 4 KB per value.</P>
      <Table rows={[
        ["store.get(key)", "Read a value (undefined when missing)."],
        ["store.set(key, value)", "Save anything JSON-serializable."],
        ["store.remove(key)", "Delete one key."],
        ["store.all()", "Snapshot of everything (debugging)."],
      ]} />
      <Code lang="javascript" block text={`onMessage(async (msg, api) => {
  if (msg.author.isBot) return;
  if (util.cmd(msg.content, "count") !== null) {
    const n = (store.get("count") || 0) + 1;
    store.set("count", n);
    await api.reply("Counted to **" + n + "**");
  }
});`} />

      <H>6 · The util helpers</H>
      <Table rows={[
        ["util.cmd(text, name)", "Match a command: both \"/name args\" and \"!name args\". Returns args (\"\" when bare) or null."],
        ["util.dice(sides)", "Random 1–sides (2–100)."],
        ["util.pick(array)", "Random element (undefined when empty)."],
        ["util.includes(hay, needle)", "Case-insensitive contains."],
        ["util.startsWithCommand(t, c)", "Legacy exact/prefix match (no / or ! handling)."],
      ]} />

      <H>7 · The http object (outside data)</H>
      <P><Code text="http.getText(url)" /> and <Code text="http.getJson(url)" /> fetch public <b>https</b> URLs (6 s timeout, 200 KB max, JSON parsed for you). Always wrap in try/catch.</P>
      <Code lang="javascript" block text={`onMessage(async (msg, api) => {
  if (msg.author.isBot) return;
  if (util.cmd(msg.content, "joke") === null) return;
  try {
    const j = await http.getJson("https://official-joke-api.appspot.com/random_joke");
    await api.reply(j.setup + " — *" + j.punchline + "*");
  } catch (e) {
    await api.reply("No jokes right now.");
  }
});`} />

      <H>8 · Commands + the / menu</H>
      <P>
        Declared commands (bot editor → Commands) appear when anyone types <Code text="/" /> in a server with the bot:
        the menu filters as they type, <Code text="Enter" /> inserts <Code text="/name" />, and your code matches it with{" "}
        <Code text="util.cmd" />. Keep handler names and declared names identical, and write a one-line description per command —
        that&apos;s what people see in the menu. Bots without commands show a “mention to talk” row instead.
      </P>

      <H>9 · @ mentions + the @ menu</H>
      <P>
        Typing <Code text="@" /> in chat completes server members (bots included) — picking one inserts{" "}
        <Code text="@username" /> and the person gets a real ping (unless they muted the channel). Bots read{" "}
        <Code text="msg.mentionsMe" /> to answer when addressed by name.
      </P>

      <H>10 · Share codes (installing bots)</H>
      <P>
        Every bot has an 8-character <Code text="share code" /> (bot editor, top). Anyone with <b>Manage Server</b> pastes it into{" "}
        <Code text="Server Settings → Bots → Add Bot" /> — the bot joins as a member immediately and its code starts running.
        Removing it there (or pausing the bot) stops it. Regenerate the code if it leaks; servers already joined keep the bot.
      </P>

      <H>11 · HTTP Bot API (outside scripts)</H>
      <P>Drive your bot from anything — cron jobs, GitHub actions, dashboards. Authenticate with the <b>token</b> (shown once at creation/regeneration):</P>
      <Code lang="bash" block text={`BASE="https://your-app.onrender.com"

# Who am I + where am I installed?
curl -H "Authorization: Bot spk_YOUR_TOKEN" $BASE/api/bot-api/me

# Send a message as the bot (5 per 10s per channel)
curl -X POST $BASE/api/bot-api/send \\
  -H "Authorization: Bot spk_YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":"CHANNEL_ID","content":"Deploy finished :white_check_mark:"}'

# Reply in a thread
curl -X POST $BASE/api/bot-api/send \\
  -H "Authorization: Bot spk_YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":"CHANNEL_ID","content":"Looking into it","replyToId":"MESSAGE_ID"}'

# Read recent history
curl -H "Authorization: Bot spk_YOUR_TOKEN" \\
  "$BASE/api/bot-api/history?channelId=CHANNEL_ID&limit=20"`} />
      <P>Responses are JSON. Errors use <Code text='{"error":"…"}' /> with HTTP 400/401/403/404/429.</P>

      <H>12 · Limits & safety</H>
      <ul className="mb-2 list-disc space-y-1 pl-5 text-[13px] text-speakit-text">
        <li>10 bots per account · 12 commands per bot · 20,000 chars of code.</li>
        <li>800 ms to load, 2.5 s per handler, max 5 answers per message. Slow code is cut off and logged.</li>
        <li>No <Code text="require" />, <Code text="process" />, <Code text="fetch" />, sockets or timers — event-driven code only.</li>
        <li>Bots are clearly tagged BOT everywhere and can&apos;t DM, friend, or trigger each other.</li>
        <li>Only the bot owner can edit code. Never paste code you don&apos;t understand — it runs on the server.</li>
      </ul>

      <H>13 · Troubleshooting</H>
      <ul className="list-disc space-y-1 pl-5 text-[13px] text-speakit-text">
        <li><b>“No reply” in Try-it-out:</b> your <Code text="util.cmd(text, …)" /> name doesn&apos;t match the Commands list, or you forgot <Code text="await" />.</li>
        <li><b>ERROR badge:</b> open Memory & health → Last error shows the exact line that failed.</li>
        <li><b>/ menu empty:</b> the bot isn&apos;t in this server, or it&apos;s paused (owner can re-enable it).</li>
        <li><b>Bot silent in server:</b> check it&apos;s installed (Server Settings → Bots), enabled, and the channel is text.</li>
      </ul>
    </div>
  );
}
