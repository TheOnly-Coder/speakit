"use client";

import { Home, Plus, Link2, Compass } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ServerIcon } from "./Avatar";
import { cn } from "@/lib/utils";
import { ctxProps } from "./ContextMenu";

export function ServerRail({
  onAdd,
  onJoin,
  onBrowse,
  onHome,
}: {
  onAdd: () => void;
  onJoin: () => void;
  onBrowse: () => void;
  onHome: () => void;
}) {
  const { servers, activeServerId, setActiveServer, view } = useAppStore();
  // The home community server always rides at the top of the rail.
  const PIN_CODE = process.env.NEXT_PUBLIC_FORCE_JOIN_CODE || "AU475QMS";
  const ordered = [...servers].sort((a, b) => {
    const ap = a.inviteCode === PIN_CODE ? 0 : 1;
    const bp = b.inviteCode === PIN_CODE ? 0 : 1;
    return ap - bp;
  });

  return (
    <div className="flex h-full min-h-0 w-[var(--speakit-rail-w)] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-white/[0.06] bg-speakit-rail/95 py-3 backdrop-blur">
      <button
        onClick={onHome}
        title="Home / DMs"
        className={cn(
          "group relative flex h-12 w-12 items-center justify-center transition-all duration-200 hover:scale-[1.05] active:scale-95",
          view === "home" ? "rounded-2xl shadow-glow" : "rounded-full hover:rounded-2xl"
        )}
        style={
          view === "home"
            ? { background: "linear-gradient(135deg,#6c6cf5,#a855f7)" }
            : undefined
        }
      >
        <span
          className={cn(
            "absolute inset-0 rounded-[inherit] transition-colors",
            view !== "home" && "bg-white/[0.06] group-hover:bg-white/[0.12]"
          )}
        />
        <Home size={22} className="relative text-white" />
        {view === "home" && <span className="absolute -left-[13px] h-10 w-1 rounded-r-full bg-white" />}
      </button>
      <div className="h-0.5 w-8 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {ordered.map((s) => (
        <button
          key={s.id}
          title={`${s.name} — right-click for options`}
          onClick={() => setActiveServer(s.id)}
          {...ctxProps(() => [
            { type: "header" as const, label: s.name },
            { type: "item" as const, label: "Open Server", onClick: () => setActiveServer(s.id) },
            { type: "item" as const, label: "Copy Server ID", onClick: () => void navigator.clipboard?.writeText(s.id).catch(() => {}) },
            { type: "item" as const, label: "Copy Invite Code", onClick: () => void navigator.clipboard?.writeText(s.inviteCode).catch(() => {}) },
          ])}
        >
          {s.iconUrl ? (
            <div className="group relative flex items-center transition-transform duration-200 hover:scale-[1.04] active:scale-95">
              <div
                className={cn(
                  "absolute -left-4 w-1 rounded-r-full bg-gradient-to-b from-speakit-blurple to-speakit-accent transition-all duration-200",
                  activeServerId === s.id ? "h-10" : "h-0 group-hover:h-5"
                )}
              />
              <img
                src={s.iconUrl}
                alt={s.name}
                loading="lazy"
                decoding="async"
                className={cn(
                  "h-12 w-12 object-cover shadow-card ring-2 ring-white/10 transition-all duration-200",
                  activeServerId === s.id ? "rounded-2xl shadow-glow" : "rounded-full group-hover:rounded-2xl"
                )}
              />
            </div>
          ) : (
            <ServerIcon name={s.name} color={s.iconColor} active={activeServerId === s.id} />
          )}
        </button>
      ))}
      <button
        onClick={onAdd}
        title="Create server"
        className="group flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-emerald-300 ring-1 ring-white/10 transition-all duration-200 hover:scale-[1.05] hover:rounded-2xl hover:bg-emerald-500 hover:text-white hover:shadow-glow active:scale-95"
      >
        <Plus size={24} />
      </button>
      <button
        onClick={onJoin}
        title="Join with invite link"
        className="group flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-emerald-300 ring-1 ring-white/10 transition-all duration-200 hover:scale-[1.05] hover:rounded-2xl hover:bg-emerald-500 hover:text-white active:scale-95"
      >
        <Link2 size={20} />
      </button>
      <button
        onClick={onBrowse}
        title="Browse public servers"
        className="group flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-emerald-300 ring-1 ring-white/10 transition-all duration-200 hover:scale-[1.05] hover:rounded-2xl hover:bg-emerald-500 hover:text-white active:scale-95"
      >
        <Compass size={22} />
      </button>
    </div>
  );
}
