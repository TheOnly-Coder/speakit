"use client";

import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  color,
  size = 40,
  status,
  src,
  className,
}: {
  name: string;
  color: string;
  size?: number;
  status?: string;
  src?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full rounded-full object-cover ring-2 ring-white/10"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-bold text-white ring-2 ring-white/10"
          style={{
            background: `linear-gradient(135deg, ${color || "#6c6cf5"} 0%, ${color || "#6c6cf5"}cc 55%, rgb(var(--sp-card)) 160%)`,
            fontSize: size * 0.36,
            letterSpacing: "-0.02em",
          }}
        >
          {initials(name || "?")}
        </div>
      )}
      {status && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-speakit-sidebar ring-1 ring-black/40",
            status === "online" && "bg-speakit-green",
            status === "idle" && "bg-amber-400",
            status === "dnd" && "bg-rose-500",
            (status === "offline" || status === "invisible") && "bg-zinc-500"
          )}
        />
      )}
    </div>
  );
}

/** Discord-style BOT badge shown next to bot names. */
export function BotTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "brand-gradient inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[10px] font-extrabold uppercase leading-tight tracking-wide text-white shadow-sm",
        className
      )}
    >
      Bot
    </span>
  );
}

export function ServerIcon({ name, color, active, unread }: { name: string; color: string; active?: boolean; unread?: boolean }) {
  return (
    <div className="group on-brand relative flex items-center">
      <div
        className={cn(
          "absolute -left-[13px] w-1 rounded-r-full bg-gradient-to-b from-speakit-blurple to-speakit-accent transition-all duration-200",
          active ? "h-10" : unread ? "h-2.5 group-hover:h-5" : "h-0 group-hover:h-5"
        )}
      />
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center font-extrabold text-white transition-all duration-200 group-hover:scale-[1.04] group-active:scale-95",
          active
            ? "rounded-2xl shadow-glow"
            : "rounded-[999px] shadow-card group-hover:rounded-2xl group-hover:shadow-pop"
        )}
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}bb 60%, #17171f 160%)`,
        }}
      >
        {initials(name)}
      </div>
    </div>
  );
}
