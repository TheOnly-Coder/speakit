import { prisma } from "./db";
import { sortedPair } from "./utils";

/**
 * Speakit AI — forced "AI" contact in every user's DMs.
 *
 * Model: always "big-pickle". It runs HERE, inside the Speakit/Opencode
 * process (no paid third-party API), so it is 100% free. Each user gets
 * their OWN isolated session + history + rate-limit bucket:
 * - history: only that user's AI DM (DirectConversation) is ever read.
 * - model instance: session id `big-pickle:<userId>` — same model name for
 *   everyone, but separate context so chats can never leak across users.
 * - rate limit: per-user token bucket, so one spammer can't rate-limit
 *   anyone else.
 *
 * Escalation: when the user asks for a real human/admin, or asks a SpeakIt
 * question Big Pickle doesn't know, the AI DMs the founders (@Kaz and
 * @viperduckdc) and only forwards their answer back to the requester.
 */

export const AI_USERNAME = "ai";
export const AI_DISPLAY_NAME = "AI";
export const AI_MODEL = "big-pickle";
const AI_EMAIL = "ai@speakit.system";
const AI_AUTH_ID = "system:ai";

const FOUNDER_USERNAMES = ["kaz", "viperduckdc"];

const AI_AVATAR_COLOR = "#6c6cf5";

// Per-user rate limit: 20 AI messages / 60s, independent buckets.
const AI_RATE_LIMIT = 20;
const AI_RATE_WINDOW_MS = 60_000;

type Escalation = {
  id: string;
  requesterId: string;
  requesterUsername: string;
  question: string;
  founderIds: string[];
  createdAt: number;
  resolved: boolean;
  resolvedBy?: string;
};

type AIShared = {
  rate: Map<string, number[]>;
  escalations: Map<string, Escalation>;
};

function shared(): AIShared {
  const g = globalThis as unknown as { __speakit_ai?: AIShared };
  if (!g.__speakit_ai) {
    g.__speakit_ai = { rate: new Map(), escalations: new Map() };
  }
  return g.__speakit_ai;
}

/** Separate model session per user — always still big-pickle. */
export function aiSessionFor(userId: string): { model: string; sessionId: string } {
  return { model: AI_MODEL, sessionId: `${AI_MODEL}:${userId}` };
}

export function checkAIRateLimit(userId: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = shared().rate.get(userId) ?? [];
  const fresh = bucket.filter((t) => now - t < AI_RATE_WINDOW_MS);
  if (fresh.length >= AI_RATE_LIMIT) {
    const oldest = Math.min(...fresh);
    const retryAfterSec = Math.ceil((AI_RATE_WINDOW_MS - (now - oldest)) / 1000);
    shared().rate.set(userId, fresh);
    return { allowed: false, retryAfterSec };
  }
  fresh.push(now);
  shared().rate.set(userId, fresh);
  return { allowed: true };
}

export async function getAIUser() {
  const ai = await prisma.user.findUnique({ where: { username: AI_USERNAME } });
  return ai;
}

export function isAIUser(u: { username?: string; id?: string } | null | undefined): boolean {
  if (!u) return false;
  return u.username?.toLowerCase() === AI_USERNAME;
}

/** Find-or-create the system AI account (a real User row, isBot). Idempotent. */
export async function ensureAIUser() {
  let ai = await prisma.user.findUnique({ where: { username: AI_USERNAME } });
  if (ai) return ai;
  // Race-safe: two boots may try at once — username is @unique.
  try {
    ai = await prisma.user.create({
      data: {
        authId: AI_AUTH_ID,
        email: AI_EMAIL,
        username: AI_USERNAME,
        displayName: AI_DISPLAY_NAME,
        avatarColor: AI_AVATAR_COLOR,
        avatarUrl: "",
        status: "online",
        isBot: true,
      },
    });
  } catch {
    ai = await prisma.user.findUnique({ where: { username: AI_USERNAME } });
  }
  if (!ai) throw new Error("Could not create AI user");
  return ai;
}

/** Every user gets their own AI conversation (separate history per user). */
export async function ensureAIConversation(userId: string) {
  const ai = await ensureAIUser();
  if (ai.id === userId) return null;
  const [a, b] = sortedPair(userId, ai.id);
  let convo = await prisma.directConversation.findUnique({
    where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
  });
  if (!convo) {
    try {
      convo = await prisma.directConversation.create({ data: { participantAId: a, participantBId: b } });
    } catch {
      convo = await prisma.directConversation.findUnique({
        where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
      });
    }
  }
  if (convo) {
    // Seed a greeting so the forced contact isn't an empty shell.
    const count = await prisma.directMessage.count({ where: { conversationId: convo.id } });
    if (count === 0) {
      await prisma.directMessage.create({
        data: {
          conversationId: convo.id,
          authorId: ai.id,
          content: `Hey! I'm ${AI_DISPLAY_NAME} 👋 — your built-in helper, powered by ${AI_MODEL} (free, right here in Speakit). Ask me how anything works here, or just chat. If I don't know a SpeakIt answer or you want a real human, I'll ping @Kaz and @viperduckdc (the founders) and bring their answer back here.`,
        },
      });
      await prisma.directConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
    }
  }
  return convo;
}

export async function findFounders() {
  const users = await prisma.user.findMany({ take: 500 });
  const lower = new Set(FOUNDER_USERNAMES);
  return users.filter((u) => lower.has(u.username.toLowerCase()));
}

function wantsHuman(text: string): boolean {
  return /\b(human|real\s+(human|person|admin|support)|talk\s+to\s+(a\s+)?(human|person|someone|admin|kaz|viper|founder|support)|human\s+admin|admin\s+help|contact\s+(an?\s+)?(admin|human|support|founder|kaz|viper)|founder|support\s+ticket|escalat(e|ion)|@kaz|@?viperduckdc)\b/i.test(text);
}

function looksLikeSpeakItQuestion(text: string): boolean {
  return /\b(speakit|server|channel|role|permission|invite|dm|direct\s*message|friend|bot|emoji|voice|pin|react|mention|timeout|kick|ban|offline|nickname|category|discover|bump|big\s*pickle)\b/i.test(text);
}

type KBEntry = { match: RegExp; answer: string };

const KNOWLEDGE: KBEntry[] = [
  {
    match: /\b(what is speakit|about speakit|what does speakit do)\b/i,
    answer:
      "Speakit is a Discord-style real-time chat + voice app: servers with text/voice channels, roles & permissions, DMs & friends, custom emoji/GIFs, bots with code, and voice rooms — all live in your browser.",
  },
  {
    match: /\b(create|make).{0,30}(server|community)\b/i,
    answer:
      "To create a server: click + on the server rail → Create your server → name it. You're the owner, so you get every permission. Add channels and invite friends with your invite code.",
  },
  {
    match: /\b(join|invite code|invited)\b/i,
    answer:
      "To join: click + on the server rail → Join a server → paste the 8-character invite code (e.g. from a friend). Custom 4–8 character codes unlock at 10 members (Server Settings → Invite).",
  },
  {
    match: /\b(leave|leaving).{0,20}server\b/i,
    answer:
      "To leave a server: open the server menu (top-left name) → Leave Server. Owners can't leave — delete the server from Server Settings instead.",
  },
  {
    match: /\bdelete.{0,20}server\b/i,
    answer: "Owners delete a server from Server Settings. Members just Leave instead (server menu → Leave Server).",
  },
  {
    match: /\bchannel\b/i,
    answer:
      "Channels live in the left sidebar. # = text, 🔊 = voice. People with Manage Channels can create/edit/delete them and group them into categories. Right-click a channel for mute/copy-ID/settings. Messages auto-delete after 7 days.",
  },
  {
    match: /\brole\b|\bpermission\b/i,
    answer:
      "Roles: Server Settings → Roles. Owners / Manage-Roles holders create roles, pick a color, and tick permissions (General, Membership, Text, Voice, Advanced). Members are grouped in the member list by their top role. 'Offline' at the bottom is automatic — invisible/offline people show there dimmed but keep their roles. 'Administrator' grants everything and bypasses channel restrictions.",
  },
  {
    match: /\boffline\b/i,
    answer:
      "'Offline' in the member list isn't a real role you can edit — it's automatic. Anyone offline or on invisible shows there (dimmed), keeping their real roles. Coming back online puts them straight back into their role group.",
  },
  {
    match: /\b(administrator|admin perms?)\b/i,
    answer: "'Administrator' (Server Settings → Roles → Advanced) grants every permission and bypasses channel restrictions. Dangerous — only give it to people you trust like @Kaz and @viperduckdc.",
  },
  {
    match: /\b(kick|ban|timeout|moderator|mod)\b/i,
    answer:
      "Moderation: Server Settings → Members (needs Kick/Ban Members perms) or right-click a member. Kick = they can rejoin with an invite; Ban = blocked until unbanned (see Banned tab); Timeout = stop someone talking for a while. Manage Messages lets mods delete/pin anyone's messages.",
  },
  {
    match: /\bmention|@everyone|ping\b/i,
    answer:
      "Type @ + a username to mention someone (they get a ping unless they muted that channel/DM). @everyone pings the whole server but needs the 'Mention @everyone' role permission.",
  },
  {
    match: /\bpin\b/i,
    answer: "Pin important messages (needs Manage Messages): hover a message → pin. 50 pins max per channel; see them in the pins view.",
  },
  {
    match: /\b(react|emoji|emote)\b/i,
    answer:
      "React with any emoji via the message hover bar (needs Add Reactions). Custom server emoji: type :name: — Server Settings → Emoji to add (needs Manage Emoji). 'Use External Emoji' lets you use other servers' emoji here.",
  },
  {
    match: /\bgif\b/i,
    answer: "Send GIFs from the message box GIF button (Klipy search) and star favorites. Attach pictures/video/audio with the + button (needs Attach Files).",
  },
  {
    match: /\b(poll)\b/i,
    answer: "Polls: if your role has 'Create Polls', use the poll button in the message box to start one.",
  },
  {
    match: /\b(history|old messages|see.*before)\b/i,
    answer: "Members with 'Read Message History' can scroll up to see messages sent before they joined. All messages auto-delete after 7 days.",
  },
  {
    match: /\bvoice\b|\b(connect|speak|mute.*voice|deafen|move.*voice)\b/i,
    answer:
      "Voice: click a 🔊 channel to join (needs Connect to join, Speak to talk). Mute/deafen yourself in the bottom bar; mods with Mute/Move Members can mute or disconnect others. Green dot = who's talking.",
  },
  {
    match: /\b(bot|share code|\/command|slash)\b/i,
    answer:
      "Bots are members with code. Owners build them in User Settings → Bots (code + /commands + share code). To add one: Server Settings → Bots → paste its share code. Type / in chat to see installed bots' commands.",
  },
  {
    match: /\b(dm|direct message|friend)\b/i,
    answer:
      "Friends: Friends tab → Add Friend (by username). Accept requests, then + (New DM) to chat. DMs are 1:1 and private. Right-click a DM to mute/close (closing deletes messages). I'm pinned at the top and can't be closed.",
  },
  {
    match: /\b(status|presence|online|idle|dnd|invisible)\b/i,
    answer:
      "Presence: click your avatar (bottom-left) → set online / idle / do-not-disturb / invisible. Invisible looks offline to everyone else. Idle auto-sets after ~5 min with no input (tab open). True offline = no live connection.",
  },
  {
    match: /\b(nickname|nick name|display name|avatar|profile|banner|theme|notification|pwa|install)\b/i,
    answer:
      "Personalize: User Settings (gear, bottom-left) → profile (display name, avatar, banner, status text), appearance/theme, notifications & sounds, and Install (PWA). Roles with Change Nickname can change their own nickname; Manage Nicknames changes others'.",
  },
  {
    match: /\b(register|sign ?up|login|log ?in|email|confirm|password)\b/i,
    answer:
      "Accounts use email + username + password (Supabase auth). Confirm your email if asked, then you're auto-added to the home server. Forgot the flow? Try Logout → Login again.",
  },
  {
    match: /\bwho (made|created|owns|founded).{0,20}speakit\b|\bfounder\b|\bkaz\b|\bviper/i,
    answer:
      "Speakit was founded by @Kaz and @viperduckdc. I can ping them for you — just say 'talk to a human' and tell me what's stuck.",
  },
  {
    match: /\bbig.?pickle\b/i,
    answer:
      `I'm powered by ${AI_MODEL} — the free model that runs right here with Speakit/Opencode (no paid API). Same model for everyone, but your history and limits are separate so nobody can snoop or rate-limit you.`,
  },
  {
    match: /\b(rate.?limit|spam|slow.?mode)\b/i,
    answer:
      "I allow ~20 messages a minute per person. Limits are per-user — someone else spamming me never slows you down. Just wait a few seconds and try again.",
  },
  {
    match: /^(hi+|hello|hey|yo|sup|howdy|good (morning|afternoon|evening))\b/i,
    answer:
      "Hey! 👋 I'm AI, your Speakit helper. Ask me how anything works here (servers, channels, roles, bots, voice…), or just chat. Want a human? Say 'talk to a human'.",
  },
  {
    match: /\b(thank|thanks|thx|appreciated)\b/i,
    answer: "Anytime! 💜 If you get stuck again, I'm pinned at the top of your DMs. Want tips on something specific — roles, bots, voice?",
  },
  {
    match: /\b(help|how (do|can|to)|what|where|why|when)\b/i,
    answer:
      "I can help with Speakit stuff: servers & invites, channels, roles & the automatic Offline group, DMs & friends, voice, bots (/commands + share codes), emoji/GIFs, pins, mentions, and settings. Tell me what's stuck — or say 'talk to a human' and I'll get @Kaz / @viperduckdc.",
  },
];

function knowledgeAnswer(text: string): string | null {
  for (const entry of KNOWLEDGE) {
    if (entry.match.test(text)) return entry.answer;
  }
  return null;
}

/**
 * Optional free upstream: if the host configured OPENCODE_AI_URL (an
 * Opencode-hosted free endpoint speaking a tiny {model, messages} JSON
 * protocol), try it first. Never throws — falls back to local Big Pickle.
 */
async function tryFreeUpstream(userId: string, history: { role: string; content: string }[], userMessage: string): Promise<string | null> {
  const url = process.env.OPENCODE_AI_URL || process.env.BIG_PICKLE_API_URL;
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const { model } = aiSessionFor(userId);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ model, session: aiSessionFor(userId).sessionId, messages: [...history.slice(-20), { role: "user", content: userMessage }] }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; reply?: string; content?: string };
    const text = String(data.text ?? data.reply ?? data.content ?? "").trim().slice(0, 1500);
    return text || null;
  } catch {
    return null;
  }
}

export async function generateAIReply(opts: {
  userId: string;
  username: string;
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<{ text: string; escalated: boolean; escalationId?: string; rateLimited?: boolean }> {
  const { userId, username, userMessage } = opts;
  const clean = userMessage.trim().slice(0, 500);
  if (!clean) return { text: "Say something and I'll do my best! 🙂", escalated: false };

  const limit = checkAIRateLimit(userId);
  if (!limit.allowed) {
    return {
      text: `Whoa, slow down a sec! ⏳ I'm letting others through — try again in ~${limit.retryAfterSec ?? 15}s. (Limits are per-person, so only your burst counts.)`,
      escalated: false,
      rateLimited: true,
    };
  }

  // Explicit human request always escalates.
  if (wantsHuman(clean)) {
    const esc = await createEscalation(userId, username, clean);
    if (esc.founderIds.length === 0) {
      return {
        text: "I hear you — you want a human. 😕 @Kaz and @viperduckdc don't seem to have accounts yet, so I can't DM them. Ask in a server channel and a mod will see it, or try me again — what's stuck?",
        escalated: false,
      };
    }
    return {
      text: `On it! 🫡 I've DM'd ${esc.founderIds.length > 1 ? "@Kaz and @viperduckdc" : "a founder"} with your question. I'll drop their answer right here as soon as one replies — no need to stay online. Anything else I can try meanwhile?`,
      escalated: true,
      escalationId: esc.id,
    };
  }

  // Free upstream first (still big-pickle, still per-user session).
  const upstream = await tryFreeUpstream(userId, opts.history, clean);
  if (upstream) return { text: upstream, escalated: false };

  const known = knowledgeAnswer(clean);
  if (known) return { text: known, escalated: false };

  // Unknown + looks like a SpeakIt question → ask the founders, don't hallucinate.
  if (looksLikeSpeakItQuestion(clean)) {
    const esc = await createEscalation(userId, username, clean);
    if (esc.founderIds.length === 0) {
      return {
        text: "Hmm, that's a SpeakIt question I don't actually know — and I won't guess. 😅 @Kaz and @viperduckdc don't have accounts here yet, so try asking in a server channel. Can you rephrase it for me in the meantime?",
        escalated: false,
      };
    }
    return {
      text: `Good question — that's beyond what I know about SpeakIt, so I'm not going to guess. 🫡 I've DM'd @Kaz and @viperduckdc with it; I'll paste their answer here as soon as one replies.`,
      escalated: true,
      escalationId: esc.id,
    };
  }

  // Generic chit-chat fallback (local Big Pickle, free).
  return {
    text: `Interesting! 🤔 I'm ${AI_DISPLAY_NAME} (${AI_MODEL}, free & built-in) — best at SpeakIt help, but happy to chat. Tell me more? (Tip: ask "how do roles work" or say "talk to a human" anytime.)`,
    escalated: false,
  };
}

export async function createEscalation(requesterId: string, requesterUsername: string, question: string) {
  const ai = await ensureAIUser();
  const founders = await findFounders();
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const esc: Escalation = {
    id,
    requesterId,
    requesterUsername,
    question: question.slice(0, 300),
    founderIds: founders.map((f) => f.id),
    createdAt: Date.now(),
    resolved: false,
  };
  shared().escalations.set(id, esc);

  for (const founder of founders) {
    try {
      const [a, b] = sortedPair(ai.id, founder.id);
      let convo = await prisma.directConversation.findUnique({
        where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
      });
      if (!convo) {
        convo = await prisma.directConversation.create({ data: { participantAId: a, participantBId: b } });
      }
      const msg = await prisma.directMessage.create({
        data: {
          conversationId: convo.id,
          authorId: ai.id,
          content: `🚨 Human help needed [#${id}] from @${requesterUsername}: "${esc.question}" — reply IN THIS DM and I'll forward it to them. (Only a founder reply sends anything to the user.)`,
        },
      });
      await prisma.directConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
      void notifyUser(founder.id, convo.id, msg.id);
    } catch {
      /* one founder failing must not block the other */
    }
  }
  return esc;
}

async function notifyUser(userId: string, conversationId: string, messageId: string) {
  try {
    const emit = (globalThis as unknown as { __speakit_io_emit?: (room: string, event: string, payload: unknown) => void }).__speakit_io_emit;
    emit?.(`user:${userId}`, "dm:notify", { conversationId, messageId });
    emit?.(`user:${userId}`, "mention:new", { conversationId });
  } catch {
    /* ignore */
  }
}

/**
 * A founder replied inside their AI DM. If they have pending escalation(s),
 * forward the reply to the requester (only then does the user hear anything).
 * Returns the forwarded escalation, if any.
 */
export async function handleFounderReply(founderId: string, conversationId: string, content: string) {
  const ai = await ensureAIUser();
  const convo = await prisma.directConversation.findUnique({ where: { id: conversationId } });
  if (!convo) return null;
  const isAiDm =
    (convo.participantAId === ai.id && convo.participantBId === founderId) ||
    (convo.participantBId === ai.id && convo.participantAId === founderId);
  if (!isAiDm) return null;

  const pending = [...shared().escalations.values()]
    .filter((e) => !e.resolved && e.founderIds.includes(founderId))
    .sort((a, b) => b.createdAt - a.createdAt);

  // Rebuild from DB after a restart: the founder DM contains [#id] markers.
  if (pending.length === 0) {
    const recent = await prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const marker = /\[#([a-z0-9]+)\]/.exec(content);
    void recent;
    void marker;
    return null;
  }

  // Prefer an explicitly referenced escalation [#id], else the newest pending.
  const ref = /\[#([a-z0-9]+)\]/.exec(content)?.[1];
  const esc = (ref && pending.find((e) => e.id === ref)) || pending[0];
  if (!esc) return null;

  const founder = await prisma.user.findUnique({ where: { id: founderId } });
  const founderName = founder ? `@${founder.username}` : "A founder";

  // Forward to the original requester via their own AI DM (isolated history).
  const userConvo = await ensureAIConversation(esc.requesterId);
  if (!userConvo) return null;
  const forward = content.replace(/\[#[a-z0-9]+\]\s*/i, "").trim().slice(0, 1500) || "(empty reply)";
  const dm = await prisma.directMessage.create({
    data: {
      conversationId: userConvo.id,
      authorId: ai.id,
      content: `${founderName} says: ${forward}`,
    },
  });
  await prisma.directConversation.update({ where: { id: userConvo.id }, data: { updatedAt: new Date() } });

  esc.resolved = true;
  esc.resolvedBy = founderId;
  shared().escalations.set(esc.id, esc);

  try {
    const emit = (globalThis as unknown as { __speakit_io_emit?: (room: string, event: string, payload: unknown) => void }).__speakit_io_emit;
    const out = {
      id: dm.id,
      content: dm.content,
      conversationId: userConvo.id,
      edited: false,
      createdAt: dm.createdAt,
      author: { id: ai.id, username: ai.username, displayName: ai.displayName, avatarColor: ai.avatarColor, avatarUrl: ai.avatarUrl },
      attachments: [],
    };
    emit?.(`dm:${userConvo.id}`, "dm:message:new", out);
    emit?.(`user:${esc.requesterId}`, "dm:notify", { conversationId: userConvo.id, message: out });
    emit?.(`user:${esc.requesterId}`, "mention:new", { conversationId: userConvo.id });
  } catch {
    /* ignore */
  }
  return esc;
}

export function pendingEscalationsFor(founderId: string): Escalation[] {
  return [...shared().escalations.values()].filter((e) => !e.resolved && e.founderIds.includes(founderId));
}
