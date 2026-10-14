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
 * What to show in sidebars / replies / notifications.
 * - Real text (not a placeholder) → the text.
 * - Empty or placeholder + attachments → friendly label.
 * - Empty + no attachments → "".
 */
export function previewForMessage(content: string, attachments: PreviewAttachment[]): string {
  const trimmed = (content ?? "").trim();
  if (trimmed && !isPlaceholderContent(trimmed)) return trimmed;
  if (attachments && attachments.length > 0) return attachmentLabel(attachments);
  return trimmed;
}

/** Whether the message body text should be rendered in chat. */
export function shouldShowBody(content: string): boolean {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return false;
  return !isPlaceholderContent(trimmed);
}
