"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, UserPlus, Settings, Plus, FolderPlus, Copy, LogOut, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { myServerPerms } from "@/lib/clientPerms";

/**
 * Discord-style server header dropdown: Invite People, Server Settings,
 * Create Channel / Category, Copy Server ID, Leave Server.
 */
export function ServerMenu({
  onInvite,
  onOpenServerSettings,
  onCreateChannel,
  onLeave,
}: {
  onInvite: () => void;
  onOpenServerSettings: () => void;
  onCreateChannel: (type: "TEXT" | "VOICE") => void;
  onLeave: () => void;
}) {
  const { serverDetail } = useAppStore();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  if (!serverDetail) return <div className="h-12 bg-speakit-sidebar" />;

  const myPerms = myServerPerms(serverDetail, user?.id);
  const canOpenSettings = ["manageServer", "manageChannels", "manageRoles", "manageEmoji", "kickMembers", "banMembers"].some((p) =>
    myPerms.has(p)
  );
  const canManageChannels = myPerms.has("manageChannels");
  const isOwner = serverDetail.ownerId === user?.id;

  const createCategory = async () => {
    const name = prompt("Category name (e.g. Gaming):");
    if (!name?.trim()) return;
    await fetch(`/api/servers/${serverDetail.id}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim().slice(0, 32) }),
    });
    await useAppStore.getState().refreshServerDetail(serverDetail.id);
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(serverDetail.id);
    } catch {
      /* ignore */
    }
  };

  const item =
    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-speakit-text transition hover:bg-speakit-blurple hover:text-white";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={canOpenSettings ? "Server menu" : "Invite friends"}
        className="flex h-12 w-full items-center gap-2.5 border-b border-white/[0.06] px-3.5 text-left shadow-sm transition hover:bg-white/[0.04]"
      >
        {serverDetail.iconUrl ? (
          <img src={serverDetail.iconUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover ring-1 ring-white/15" loading="lazy" decoding="async" />
        ) : (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white shadow-card ring-1 ring-white/15"
            style={{ background: `linear-gradient(135deg, ${serverDetail.iconColor}, ${serverDetail.iconColor}aa)` }}
          >
            {serverDetail.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="flex-1 truncate text-[15px] font-extrabold tracking-tight text-white">{serverDetail.name}</span>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <ChevronDown size={14} className="text-speakit-muted" />
        </span>
      </button>

      {open && (
        <div className="menu-pop absolute left-2 right-2 top-full z-40 mt-1.5 overflow-hidden rounded-2xl border border-white/10 bg-[#121218]/95 p-1.5 shadow-pop backdrop-blur-xl">
          <button
            onClick={() => {
              setOpen(false);
              onInvite();
            }}
            className={`${item} text-[#949cf7]`}
          >
            Invite People <UserPlus size={14} />
          </button>
          {(canOpenSettings || isOwner) && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenServerSettings();
              }}
              className={item}
            >
              Server Settings <Settings size={14} />
            </button>
          )}
          {canManageChannels && (
            <>
              <button
                onClick={() => {
                  setOpen(false);
                  onCreateChannel("TEXT");
                }}
                className={item}
              >
                Create Channel <Plus size={14} />
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  void createCategory();
                }}
                className={item}
              >
                Create Category <FolderPlus size={14} />
              </button>
            </>
          )}
          <div className="my-1 h-px bg-white/10" />
          <button
            onClick={() => {
              setOpen(false);
              void copyId();
            }}
            className={item}
          >
            Copy Server ID <Copy size={14} />
          </button>
          {!isOwner && (
            <button
              onClick={() => {
                setOpen(false);
                onLeave();
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-[13px] font-medium text-red-400 hover:bg-red-500 hover:text-white"
            >
              Leave Server <LogOut size={14} />
            </button>
          )}
          {isOwner && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-speakit-muted">
              <X size={12} /> Owners can&apos;t leave — transfer or delete instead.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
