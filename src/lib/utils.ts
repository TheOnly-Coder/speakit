import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" })} ${time}`;
}

export function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
