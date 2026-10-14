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
          className="h-full w-full rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ backgroundColor: color || "#5865f2", fontSize: size * 0.38 }}
        >
          {initials(name || "?")}
        </div>
      )}
      {status && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-speakit-sidebar",
            status === "online" && "bg-speakit-green",
            status === "idle" && "bg-yellow-500",
            status === "dnd" && "bg-red-500",
            (status === "offline" || status === "invisible") && "bg-gray-500"
          )}
        />
      )}
    </div>
  );
}

export function ServerIcon({ name, color, active, unread }: { name: string; color: string; active?: boolean; unread?: boolean }) {
  return (
    <div className="group relative flex items-center">
      <div
        className={cn(
          "absolute -left-4 w-1 rounded-r-full bg-white transition-all",
          active ? "h-10" : unread ? "h-2 group-hover:h-5" : "h-0 group-hover:h-5"
        )}
      />
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center font-bold text-white transition-all",
          active ? "rounded-2xl" : "rounded-full group-hover:rounded-2xl"
        )}
        style={{ backgroundColor: color }}
      >
        {initials(name)}
      </div>
    </div>
  );
}
