/** Friendly labels for attachment-only messages.
 * Old messages stored "(attachment)" / "(image)" as content — we hide that
 * and show a proper label instead. New messages store "" when there's no text.
 */

export const ATTACHMENT_PLACEHOLDERS = new Set([
  "(attachment)",
  "(image)",
  "(gif)",
  "(file)",
]);

export type PreviewAttachment = { mime?: string; url?: string; name?: string };

export function isPlaceholderContent(content: string): boolean {
  return ATTACHMENT_PLACEHOLDERS.has(content.trim().toLowerCase());
}

function isGif(a: PreviewAttachment): boolean {
  if ((a.mime ?? "").toLowerCase() === "image/gif") return true;
  const url = (a.url ?? "").toLowerCase();
  if (url.includes("klipy")) return true;
  if (url.endsWith(".gif")) return true;
  const name = (a.name ?? "").toLowerCase();
  if (name.endsWith(".gif")) return true;
  return false;
}

/** Short label for an attachment list, e.g. "GIF", "Photo", "Audio". */
export function attachmentLabel(attachments: PreviewAttachment[]): string {
  if (!attachments || attachments.length === 0) return "";
  const first = attachments[0];
  const mime = (first.mime ?? "").toLowerCase();
  if (isGif(first)) return attachments.length > 1 ? `GIF (+${attachments.length - 1})` : "GIF";
  if (mime.startsWith("image/")) return attachments.length > 1 ? `📷 ${attachments.length} photos` : "📷 Photo";
  if (mime.startsWith("audio/")) return "🎵 Audio";
  return attachments.length > 1 ? `📎 ${attachments.length} attachments` : "📎 Attachment";
}

/**
 * Strip Discord-like markdown down to plain text for sidebars / replies /
 * notifications. Keeps the readable content, drops the syntax.
 */
export function stripDiscordMarkdown(content: string): string {
  let s = content ?? "";
  // Code blocks ```lang\ncode``` (closed or unclosed) -> keep code.
  s = s.replace(/```(?:\w+\n)?([\s\S]*?)(?:```|$)/g, "$1");
  // Inline code `x` -> x
  s = s.replace(/`([^`\n]+)`/g, "$1");
  // Spoilers ||x|| -> x
  s = s.replace(/\|\|([\s\S]+?)\|\|/g, "$1");
  // Bold+italic / bold / underline / italic / strike (largest first).
  s = s.replace(/\*\*\*([\s\S]+?)\*\*\*/g, "$1");
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, "$1");
  s = s.replace(/__([\s\S]+?)__/g, "$1");
  s = s.replace(/~~([\s\S]+?)~~/g, "$1");
  // Single *italic* and _italic_ (guard _ so snake_case survives).
  s = s.replace(/(^|[\s(*~>|,;:.!?'"-])\*([^*\s][^*]*?)\*/g, "$1$2");
  s = s.replace(/(^|[\s(*~>|,;:.!?'"-])_([^_\s][^_]*?)_(?![A-Za-z0-9_])/g, "$1$2");
  // Headings / subtext at line starts.
  s = s.replace(/^\s*#{1,3}\s+/gm, "");
  s = s.replace(/^\s*-#\s+/gm, "");
  // >>> multiline quote and > quotes.
  s = s.replace(/^\s*>>>\s?/gm, "");
  s = s.replace(/^\s*>\s?/gm, "");
  // Bullets and ordered lists.
  s = s.replace(/^\s*[-*]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  // Masked links [text](url) -> text, <url> -> url.
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");
  s = s.replace(/<(https?:\/\/[^<>\s]+)>/g, "$1");
  // Escapes: \X -> X
  s = s.replace(/\\([*_~`|>#\-+.!()[\]{}@:])/g, "$1");
  // Collapse whitespace/newlines for one-line previews.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * What to show in sidebars / replies / notifications.
 * - Real text (not a placeholder) → plain-text version (markdown stripped).
 * - Empty or placeholder + attachments → friendly label.
 * - Empty + no attachments → "".
 */
export function previewForMessage(content: string, attachments: PreviewAttachment[]): string {
  const trimmed = (content ?? "").trim();
  if (trimmed && !isPlaceholderContent(trimmed)) return stripDiscordMarkdown(trimmed);
  if (attachments && attachments.length > 0) return attachmentLabel(attachments);
  return trimmed;
}

/** Whether the message body text should be rendered in chat. */
export function shouldShowBody(content: string): boolean {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return false;
  return !isPlaceholderContent(trimmed);
}
