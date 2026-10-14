/** Shared attachment validation (usable from API routes and the socket server). */

export type IncomingAttachment = {
  url: string;
  name?: string;
  size?: number;
  mime?: string;
};

export type CleanAttachment = {
  url: string;
  name: string;
  size: number;
  mime: string;
};

const MAX_ATTACHMENTS = 5;
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB — friendly to the Supabase free tier
const ALLOWED_MIME = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/;

function storageBase(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/` : "";
}

/** Keep only safe chat-upload attachments. Returns [] for anything invalid. */
export function sanitizeAttachments(input: unknown): CleanAttachment[] {
  if (!Array.isArray(input)) return [];
  const prefix = `${storageBase()}chat-uploads/`;
  const out: CleanAttachment[] = [];
  for (const item of input.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== "object") continue;
    const { url, name, size, mime } = item as IncomingAttachment;
    if (typeof url !== "string" || !prefix || !url.startsWith(prefix)) continue;
    if (url.length > 2048) continue;
    const cleanMime = typeof mime === "string" ? mime.slice(0, 64) : "";
    if (!ALLOWED_MIME.test(cleanMime)) continue;
    const cleanSize = typeof size === "number" && size > 0 ? Math.min(Math.floor(size), MAX_SIZE) : 0;
    if (size && size > MAX_SIZE) continue;
    out.push({
      url,
      name: typeof name === "string" ? name.slice(0, 128) : "image",
      size: cleanSize,
      mime: cleanMime,
    });
  }
  return out;
}

/** Public URL prefix check for avatar images. */
export function isAvatarUrl(url: string): boolean {
  const prefix = `${storageBase()}avatars/`;
  return !!prefix && typeof url === "string" && url.startsWith(prefix) && url.length <= 2048;
}
