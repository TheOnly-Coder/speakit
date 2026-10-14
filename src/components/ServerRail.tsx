"use client";

import { Home, Plus, Link2, Compass } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ServerIcon } from "./Avatar";
import { cn } from "@/lib/utils";

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
    <div className="flex w-[72px] flex-col items-center gap-2 overflow-y-auto bg-speakit-rail py-3">
      <button
        onClick={onHome}
        title="Home / DMs"
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full bg-speakit-sidebar text-white transition-all hover:rounded-2xl hover:bg-speakit-blurple",
          view === "home" && "rounded-2xl bg-speakit-blurple"
        )}
      >
        <Home size={22} />
      </button>
      <div className="h-0.5 w-8 rounded bg-white/10" />
      {ordered.map((s) => (
        <button key={s.id} title={s.name} onClick={() => setActiveServer(s.id)}>
          {s.iconUrl ? (
            <div className="group relative flex items-center">
              <div
                className={cn(
                  "absolute -left-4 w-1 rounded-r-full bg-white transition-all",
                  activeServerId === s.id ? "h-10" : "h-0 group-hover:h-5"
                )}
              />
              <img
                src={s.iconUrl}
                alt={s.name}
                className={cn(
                  "h-12 w-12 object-cover transition-all",
                  activeServerId === s.id ? "rounded-2xl" : "rounded-full group-hover:rounded-2xl"
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
        className="flex h-12 w-12 items-center justify-center rounded-full bg-speakit-sidebar text-speakit-green transition-all hover:rounded-2xl hover:bg-speakit-green hover:text-white"
      >
        <Plus size={24} />
      </button>
      <button
        onClick={onJoin}
        title="Join with invite link"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-speakit-sidebar text-speakit-green transition-all hover:rounded-2xl hover:bg-speakit-green hover:text-white"
      >
        <Link2 size={20} />
      </button>
      <button
        onClick={onBrowse}
        title="Browse public servers"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-speakit-sidebar text-speakit-green transition-all hover:rounded-2xl hover:bg-speakit-green hover:text-white"
      >
        <Compass size={22} />
      </button>
    </div>
  );
}
