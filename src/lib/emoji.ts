import type { ServerEmoji } from "@/store/useAppStore";

/** Render `:shortcode:` custom emoji inside message text. Returns React-node-ready parts. */
export function splitShortcodes(text: string): ({ text: string } | { emoji: string })[] {
  const parts: ({ text: string } | { emoji: string })[] = [];
  const re = /:([a-z0-9_]{2,32}):/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ emoji: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function emojiUrlFor(
  name: string,
  currentServerId: string | undefined,
  byServer: Record<string, ServerEmoji[]>,
  mine: ServerEmoji[]
): string | null {
  if (currentServerId && byServer[currentServerId]) {
    const hit = byServer[currentServerId].find((e) => e.name === name);
    if (hit) return hit.url;
  }
  const hit = mine.find((e) => e.name === name);
  return hit ? hit.url : null;
}

/** A compact curated native-emoji palette for the picker (searchable). */
export const NATIVE_EMOJI: { char: string; name: string; group: string }[] = [
  { char: "😀", name: "grinning", group: "faces" },
  { char: "😁", name: "beaming", group: "faces" },
  { char: "😂", name: "joy laughing tears", group: "faces" },
  { char: "🤣", name: "rofl rolling floor", group: "faces" },
  { char: "😊", name: "smiling blush happy", group: "faces" },
  { char: "😍", name: "heart eyes love", group: "faces" },
  { char: "😎", name: "cool sunglasses", group: "faces" },
  { char: "🤔", name: "thinking hmm", group: "faces" },
  { char: "😴", name: "sleeping tired", group: "faces" },
  { char: "😷", name: "mask sick", group: "faces" },
  { char: "🤯", name: "mind blown exploding", group: "faces" },
  { char: "🥳", name: "party celebrating", group: "faces" },
  { char: "😭", name: "crying sob tears sad", group: "faces" },
  { char: "😡", name: "angry rage red mad", group: "faces" },
  { char: "👍", name: "thumbs up yes like", group: "hands" },
  { char: "👎", name: "thumbs down no", group: "hands" },
  { char: "👏", name: "clapping applause", group: "hands" },
  { char: "🙏", name: "pray please thanks", group: "hands" },
  { char: "💪", name: "strong muscle flex", group: "hands" },
  { char: "👋", name: "wave hello hi bye", group: "hands" },
  { char: "✌️", name: "peace victory", group: "hands" },
  { char: "🤝", name: "handshake deal", group: "hands" },
  { char: "👀", name: "eyes looking watch", group: "hands" },
  { char: "🔥", name: "fire lit hype", group: "symbols" },
  { char: "⭐", name: "star favorite", group: "symbols" },
  { char: "💯", name: "hundred 100 perfect", group: "symbols" },
  { char: "❤️", name: "red heart love", group: "symbols" },
  { char: "💔", name: "broken heart", group: "symbols" },
  { char: "✨", name: "sparkles shiny new", group: "symbols" },
  { char: "🎉", name: "party tada celebration", group: "symbols" },
  { char: "🎮", name: "gaming controller game", group: "fun" },
  { char: "⚽", name: "soccer football sport", group: "fun" },
  { char: "🎵", name: "music note song", group: "fun" },
  { char: "🍕", name: "pizza food", group: "fun" },
  { char: "☕", name: "coffee drink", group: "fun" },
  { char: "🚀", name: "rocket launch fast", group: "fun" },
  { char: "✅", name: "check yes done ok", group: "symbols" },
  { char: "❌", name: "cross no wrong", group: "symbols" },
  { char: "❓", name: "question what help", group: "symbols" },
  { char: "💡", name: "idea light bulb", group: "symbols" },
  { char: "📌", name: "pin pinned important", group: "symbols" },
  { char: "👑", name: "crown king owner", group: "fun" },
  { char: "😺", name: "cat smile happy", group: "faces" },
  { char: "🐶", name: "dog puppy", group: "fun" },
  { char: "🦊", name: "fox", group: "fun" },
  { char: "🐸", name: "frog pepe", group: "fun" },
  { char: "💀", name: "skull dead lol", group: "symbols" },
  { char: "🤖", name: "robot bot", group: "fun" },
  { char: "👻", name: "ghost spooky", group: "fun" },
];
