"use client";

import React, { useState } from "react";

/**
 * Discord-like markdown renderer.
 *
 * Supports (Discord behavior):
 * - ***bold italic***, **bold**, *italic*, _italic_, __underline__, ~~strike~~
 * - `inline code`, ```code block``` (with optional language, unclosed still code)
 * - # / ## / ### headings (line start, requires space), -# subtext
 * - > quote (consecutive lines grouped), >>> multiline quote (rest of message)
 * - - / * bullet lists, 1. ordered lists
 * - ||spoiler|| (click to reveal)
 * - [masked](https://url) + bare https:// links + <https://suppressed>
 * - :custom_emoji: via resolveEmoji (skipped inside code)
 * - @everyone / @here / @username highlight
 * - \* escapes
 *
 * No dangerouslySetInnerHTML — everything is React nodes, so HTML is escaped.
 */

export type EmojiResolver = (name: string) => string | null;

// ---------------------------------------------------------------------------
// inline parser
// ---------------------------------------------------------------------------

function countBackslashesBefore(text: string, idx: number): number {
  let n = 0;
  let k = idx - 1;
  while (k >= 0 && text[k] === "\\") {
    n++;
    k--;
  }
  return n;
}

function isEscaped(text: string, idx: number): boolean {
  return countBackslashesBefore(text, idx) % 2 === 1;
}

/** Count a run of `ch` containing idx. */
function runLenOf(text: string, idx: number, ch: string): number {
  let l = idx;
  while (l - 1 >= 0 && text[l - 1] === ch) l--;
  let r = idx;
  while (r + 1 < text.length && text[r + 1] === ch) r++;
  return r - l + 1;
}

/**
 * Find `token` at/after `from`, skipping escaped hits and hits that are part
 * of a longer run (so `**` doesn't match inside `***`, single `*` doesn't
 * match inside `**`, etc). Returns -1 when missing.
 */
function findClosing(text: string, from: number, token: string): number {
  const ch = token[0];
  let idx = from;
  while (true) {
    idx = text.indexOf(token, idx);
    if (idx === -1) return -1;
    if (isEscaped(text, idx)) {
      idx += token.length;
      continue;
    }
    const run = runLenOf(text, idx, ch);
    if (run !== token.length) {
      // Skip the whole run.
      let end = idx;
      while (end < text.length && text[end] === ch) end++;
      idx = end;
      continue;
    }
    // Single-underscore close must not be glued to a word (protect snake_case).
    if (token === "_") {
      const next = text[idx + 1];
      if (next && /[A-Za-z0-9_]/.test(next)) {
        idx += 1;
        continue;
      }
    }
    return idx;
  }
}

function trimTrailingPunct(url: string): { url: string; trail: string } {
  // Strip ), ], }, ., ,, !, ?, ;, :, ', " from the end (Discord-like).
  let end = url.length;
  while (end > 0 && /[.,!?;:)\]}'"]/.test(url[end - 1])) end--;
  return { url: url.slice(0, end), trail: url.slice(end) };
}

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s<>"']+$/i.test(url);
}

let inlineKey = 0;

function parseInline(text: string, resolveEmoji: EmojiResolver): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  const push = (node: React.ReactNode) => {
    flush();
    out.push(node);
  };

  while (i < text.length) {
    const c = text[i];

    // Escape: \X -> literal X (only for punctuation / special).
    if (c === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if (/[*_~`|>#\-+.!()[\]{}@:]/.test(next)) {
        buf += next;
        i += 2;
        continue;
      }
      buf += c;
      i += 1;
      continue;
    }

    // *** bold+italic (must come before ** and *)
    if (text.startsWith("***", i) && !isEscaped(text, i) && runLenOf(text, i, "*") === 3) {
      const close = findClosing(text, i + 3, "***");
      if (close !== -1 && close > i + 3) {
        const inner = text.slice(i + 3, close);
        if (inner.trim()) {
          push(
            <strong key={`k${inlineKey++}`} className="font-bold">
              <em>{parseInline(inner, resolveEmoji)}</em>
            </strong>
          );
          i = close + 3;
          continue;
        }
      }
    }

    // ** bold
    if (text.startsWith("**", i) && !isEscaped(text, i) && runLenOf(text, i, "*") === 2) {
      const close = findClosing(text, i + 2, "**");
      if (close !== -1 && close > i + 2) {
        const inner = text.slice(i + 2, close);
        if (inner.trim()) {
          push(
            <strong key={`k${inlineKey++}`} className="font-bold">
              {parseInline(inner, resolveEmoji)}
            </strong>
          );
          i = close + 2;
          continue;
        }
      }
    }

    // __ underline (before single _)
    if (text.startsWith("__", i) && !isEscaped(text, i) && runLenOf(text, i, "_") === 2) {
      const close = findClosing(text, i + 2, "__");
      if (close !== -1 && close > i + 2) {
        const inner = text.slice(i + 2, close);
        if (inner.trim()) {
          push(
            <u key={`k${inlineKey++}`} className="underline">
              {parseInline(inner, resolveEmoji)}
            </u>
          );
          i = close + 2;
          continue;
        }
      }
    }

    // ~~ strikethrough
    if (text.startsWith("~~", i) && !isEscaped(text, i) && runLenOf(text, i, "~") === 2) {
      const close = findClosing(text, i + 2, "~~");
      if (close !== -1 && close > i + 2) {
        const inner = text.slice(i + 2, close);
        if (inner.trim()) {
          push(
            <s key={`k${inlineKey++}`} className="line-through">
              {parseInline(inner, resolveEmoji)}
            </s>
          );
          i = close + 2;
          continue;
        }
      }
    }

    // || spoiler
    if (text.startsWith("||", i) && !isEscaped(text, i) && runLenOf(text, i, "|") === 2) {
      const close = findClosing(text, i + 2, "||");
      if (close !== -1 && close > i + 2) {
        const inner = text.slice(i + 2, close);
        if (inner.trim() || inner) {
          push(<Spoiler key={`k${inlineKey++}`} content={inner} resolveEmoji={resolveEmoji} />);
          i = close + 2;
          continue;
        }
      }
    }

    // ` inline code (single backtick run only; ``` blocks are split earlier)
    if (c === "`" && !isEscaped(text, i) && runLenOf(text, i, "`") === 1) {
      const close = findClosing(text, i + 1, "`");
      if (close !== -1 && close > i + 1) {
        const code = text.slice(i + 1, close);
        push(
          <code
            key={`k${inlineKey++}`}
            className="rounded bg-black/40 px-1 py-px font-mono text-[0.92em] text-[#e8e8e8]"
          >
            {code}
          </code>
        );
        i = close + 1;
        continue;
      }
      // No closing — literal.
      buf += c;
      i += 1;
      continue;
    }
    // Leftover ``` without a pair (unclosed handled at block level) — literal.
    if (c === "`" && runLenOf(text, i, "`") !== 1) {
      buf += c;
      i += 1;
      continue;
    }

    // [masked link](url)
    if (c === "[" && !isEscaped(text, i)) {
      const m = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text.slice(i));
      if (m && isSafeHttpUrl(m[2])) {
        const label = m[1];
        const url = m[2];
        push(
          <a
            key={`k${inlineKey++}`}
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[#00a8fc] hover:underline"
          >
            {parseInline(label, resolveEmoji)}
          </a>
        );
        i += m[0].length;
        continue;
      }
    }

    // <https://...> suppressed embed — render as plain link without brackets.
    if (c === "<" && !isEscaped(text, i)) {
      const m = /^<(https?:\/\/[^<>\s]+)>/.exec(text.slice(i));
      if (m && isSafeHttpUrl(m[1])) {
        push(
          <a
            key={`k${inlineKey++}`}
            href={m[1]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[#00a8fc] hover:underline"
          >
            {m[1]}
          </a>
        );
        i += m[0].length;
        continue;
      }
    }

    // Bare https:// links
    if (
      (text.startsWith("https://", i) || text.startsWith("http://", i)) &&
      (i === 0 || /[\s(]/.test(text[i - 1] ?? ""))
    ) {
      const m = /^https?:\/\/[^\s<]+/.exec(text.slice(i));
      if (m) {
        const { url, trail } = trimTrailingPunct(m[0]);
        if (url && isSafeHttpUrl(url)) {
          push(
            <a
              key={`k${inlineKey++}`}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[#00a8fc] hover:underline"
            >
              {url}
            </a>
          );
          if (trail) buf += trail;
          i += m[0].length;
          continue;
        }
      }
    }

    // :custom_emoji:
    if (c === ":" && !isEscaped(text, i)) {
      const m = /^:([a-z0-9_]{2,32}):/.exec(text.slice(i));
      if (m) {
        const url = resolveEmoji(m[1]);
        if (url) {
          push(
            <img
              key={`k${inlineKey++}`}
              src={url}
              alt={`:${m[1]}:`}
              title={`:${m[1]}:`}
              className="inline h-6 w-6 object-contain align-[-4px]"
              loading="lazy"
              draggable={false}
            />
          );
        } else {
          buf += m[0];
        }
        i += m[0].length;
        continue;
      }
    }

    // @mentions
    if (c === "@" && !isEscaped(text, i)) {
      const m = /^@(everyone|here|[A-Za-z0-9_.]{1,32})/.exec(text.slice(i));
      if (m) {
        push(
          <span key={`k${inlineKey++}`} className="mention-pill">
            {m[0]}
          </span>
        );
        i += m[0].length;
        continue;
      }
    }

    // * italic (single)
    if (c === "*" && !isEscaped(text, i) && runLenOf(text, i, "*") === 1) {
      const next = text[i + 1];
      if (!next || next === " " || next === "\n") {
        buf += c;
        i += 1;
        continue;
      }
      const close = findClosing(text, i + 1, "*");
      if (close !== -1 && close > i + 1) {
        const inner = text.slice(i + 1, close);
        if (inner.trim() && !inner.startsWith(" ") && !inner.endsWith(" ")) {
          push(
            <em key={`k${inlineKey++}`} className="italic">
              {parseInline(inner, resolveEmoji)}
            </em>
          );
          i = close + 1;
          continue;
        }
      }
      buf += c;
      i += 1;
      continue;
    }

    // _ italic (single, guarded so snake_case doesn't break)
    if (c === "_" && !isEscaped(text, i) && runLenOf(text, i, "_") === 1) {
      const prev = i > 0 ? text[i - 1] : "";
      const next = text[i + 1];
      const prevOk = i === 0 || /[\s(*~>|,;:.!?'"\-]/.test(prev);
      if (!prevOk || !next || next === " " || next === "\n") {
        buf += c;
        i += 1;
        continue;
      }
      const close = findClosing(text, i + 1, "_");
      if (close !== -1 && close > i + 1) {
        const inner = text.slice(i + 1, close);
        if (inner.trim() && !inner.startsWith(" ") && !inner.endsWith(" ")) {
          push(
            <em key={`k${inlineKey++}`} className="italic">
              {parseInline(inner, resolveEmoji)}
            </em>
          );
          i = close + 1;
          continue;
        }
      }
      buf += c;
      i += 1;
      continue;
    }

    buf += c;
    i += 1;
  }
  flush();
  return out;
}

function Spoiler({ content, resolveEmoji }: { content: string; resolveEmoji: EmojiResolver }) {
  const [open, setOpen] = useState(false);
  const inner = parseInline(content, resolveEmoji);
  if (open) {
    return (
      <span className="rounded bg-white/10 px-1" onClick={() => setOpen(false)} title="Hide spoiler">
        {inner}
      </span>
    );
  }
  return (
    <span
      className="cursor-pointer select-none rounded bg-black/70 px-1 text-transparent hover:bg-black/50"
      onClick={() => setOpen(true)}
      title="Spoiler — click to reveal"
    >
      <span className="text-transparent">{inner}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// block parser
// ---------------------------------------------------------------------------

const HEADING_RE = /^\s*(#{1,3}) (.+?)\s*$/;
const SUBTEXT_RE = /^\s*-#\s+(.+?)\s*$/;
const MULTILINE_QUOTE_RE = /^\s*>>>\s?(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const BULLET_RE = /^\s*[-*]\s+(.+)$/;
const ORDERED_RE = /^\s*\d+\.\s+(.+)$/;
const ESCAPED_BLOCK_RE = /^\s*\\([#>*-])/;

function isSpecialLine(line: string): boolean {
  if (ESCAPED_BLOCK_RE.test(line)) return false;
  return (
    HEADING_RE.test(line) ||
    SUBTEXT_RE.test(line) ||
    MULTILINE_QUOTE_RE.test(line) ||
    QUOTE_RE.test(line) ||
    BULLET_RE.test(line) ||
    ORDERED_RE.test(line)
  );
}

function parseBlocks(chunk: string, resolveEmoji: EmojiResolver, keyPrefix: string): React.ReactNode[] {
  const lines = chunk.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  const key = () => `${keyPrefix}-b${k++}`;

  while (i < lines.length) {
    const line = lines[i];

    // >>> multiline quote — everything after it is quoted (Discord behavior).
    let m = MULTILINE_QUOTE_RE.exec(line);
    if (m && !ESCAPED_BLOCK_RE.test(line)) {
      const rest = [m[1], ...lines.slice(i + 1)].join("\n");
      if (rest.trim()) {
        out.push(
          <div key={key()} className="my-0.5 flex gap-2">
            <div className="w-1 shrink-0 rounded bg-white/25" />
            <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {parseBlocks(rest, resolveEmoji, `${keyPrefix}-q`)}
            </div>
          </div>
        );
      }
      break;
    }

    // # / ## / ### headings
    m = HEADING_RE.exec(line);
    if (m && !ESCAPED_BLOCK_RE.test(line)) {
      const level = m[1].length;
      const inner = parseInline(m[2], resolveEmoji);
      const cls =
        level === 1
          ? "text-[24px] font-bold leading-tight"
          : level === 2
            ? "text-[20px] font-bold leading-tight"
            : "text-[16px] font-bold leading-snug";
      out.push(
        <div key={key()} className={`my-0.5 ${cls}`}>
          {inner}
        </div>
      );
      i++;
      continue;
    }

    // -# subtext
    m = SUBTEXT_RE.exec(line);
    if (m && !ESCAPED_BLOCK_RE.test(line)) {
      out.push(
        <div key={key()} className="my-0.5 text-[13px] leading-snug text-speakit-muted">
          {parseInline(m[1], resolveEmoji)}
        </div>
      );
      i++;
      continue;
    }

    // > quotes (group consecutive)
    if (QUOTE_RE.test(line) && !ESCAPED_BLOCK_RE.test(line)) {
      const innerLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i]) && !ESCAPED_BLOCK_RE.test(lines[i])) {
        innerLines.push(QUOTE_RE.exec(lines[i])![1]);
        i++;
      }
      const inner = innerLines.join("\n");
      if (inner.trim()) {
        out.push(
          <div key={key()} className="my-0.5 flex gap-2">
            <div className="w-1 shrink-0 rounded bg-white/25" />
            <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {parseBlocks(inner, resolveEmoji, `${keyPrefix}-q${k}`)}
            </div>
          </div>
        );
      } else {
        out.push(<div key={key()} className="h-2" />);
      }
      continue;
    }

    // - / * bullets (group consecutive)
    if (BULLET_RE.test(line) && !ESCAPED_BLOCK_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i]) && !ESCAPED_BLOCK_RE.test(lines[i])) {
        items.push(BULLET_RE.exec(lines[i])![1]);
        i++;
      }
      out.push(
        <ul key={key()} className="my-0.5 list-disc space-y-0.5 pl-6">
          {items.map((it, idx) => (
            <li key={idx} className="whitespace-pre-wrap break-words">
              {parseInline(it, resolveEmoji)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 1. ordered (group consecutive)
    if (ORDERED_RE.test(line) && !ESCAPED_BLOCK_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED_RE.test(lines[i]) && !ESCAPED_BLOCK_RE.test(lines[i])) {
        items.push(ORDERED_RE.exec(lines[i])![1]);
        i++;
      }
      out.push(
        <ol key={key()} className="my-0.5 list-decimal space-y-0.5 pl-6">
          {items.map((it, idx) => (
            <li key={idx} className="whitespace-pre-wrap break-words">
              {parseInline(it, resolveEmoji)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Normal paragraph — group until the next special line.
    const para: string[] = [];
    while (i < lines.length && !isSpecialLine(lines[i])) {
      // Stop before a >>> (handled above next iteration).
      if (MULTILINE_QUOTE_RE.test(lines[i]) && !ESCAPED_BLOCK_RE.test(lines[i])) break;
      para.push(lines[i]);
      i++;
    }
    const text = para.join("\n");
    if (!text) {
      continue;
    }
    if (!text.trim()) {
      out.push(<div key={key()} className="h-2" />);
      continue;
    }
    out.push(
      <div key={key()} className="whitespace-pre-wrap break-words">
        {parseInline(text, resolveEmoji)}
      </div>
    );
  }

  return out;
}

// Split ``` code blocks first so nothing inside them is formatted.
function renderWithCode(
  full: string,
  resolveEmoji: EmojiResolver,
  keyPrefix: string
): React.ReactNode[] {
  // Reset per top-level render so identical content yields identical keys
  // across re-renders (stable keys preserve <Spoiler> open state).
  inlineKey = 0;
  const out: React.ReactNode[] = [];
  const re = /```(?:(\w+)\n)?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  let foundAnyFence = full.includes("```");

  // Fast path: no fences at all.
  if (!foundAnyFence) return parseBlocks(full, resolveEmoji, keyPrefix);

  while ((m = re.exec(full)) !== null) {
    const fenceAt = full.indexOf("```", last);
    if (fenceAt === -1) break;
    // Text before this fence.
    if (fenceAt > last) {
      const before = full.slice(last, fenceAt);
      if (before) out.push(...parseBlocks(before, resolveEmoji, `${keyPrefix}-t${k++}`));
    }
    const lang = (m[1] ?? "").trim();
    // m[2] is the code; when the regex hit `$` (unclosed), it runs to the end.
    const code = (m[2] ?? "").replace(/^\n/, "").replace(/\n$/, "");
    out.push(
      <pre
        key={`${keyPrefix}-c${k++}`}
        className="my-1.5 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/40 p-2.5 font-mono text-[13px] leading-relaxed text-speakit-text"
      >
        {lang ? <div className="mb-1 text-[11px] text-speakit-muted">{lang}</div> : null}
        <code>{code}</code>
      </pre>
    );
    last = m.index + m[0].length;
    // If the match ended at $ without a closing fence, we're done.
    if (!m[0].endsWith("```")) break;
  }
  if (last < full.length) {
    out.push(...parseBlocks(full.slice(last), resolveEmoji, `${keyPrefix}-t${k++}`));
  }
  return out;
}

export function MarkdownContent({
  text,
  resolveEmoji,
}: {
  text: string;
  resolveEmoji?: EmojiResolver;
}) {
  const resolver: EmojiResolver = resolveEmoji ?? (() => null);
  return <>{renderWithCode(text, resolver, "md")}</>;
}
