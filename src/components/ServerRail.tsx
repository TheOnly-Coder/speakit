"use client";

import { Home, Plus, Compass } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ServerIcon } from "./Avatar";
import { cn } from "@/lib/utils";

export function ServerRail({
  onAdd,
  onJoin,
  onHome,
}: {
  onAdd: () => void;
  onJoin: () => void;
  onHome: () => void;
}) {
  const { servers, activeServerId, setActiveServer, view } = useAppStore();

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
      {servers.map((s) => (
        <button key={s.id} title={s.name} onClick={() => setActiveServer(s.id)}>
          <ServerIcon name={s.name} color={s.iconColor} active={activeServerId === s.id} />
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
        title="Join server"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-speakit-sidebar text-speakit-green transition-all hover:rounded-2xl hover:bg-speakit-green hover:text-white"
      >
        <Compass size={22} />
      </button>
    </div>
  );
}
