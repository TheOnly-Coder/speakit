"use client";

import { Crown } from "lucide-react";
import { Avatar, BotTag } from "./Avatar";
import { useProfileStore } from "@/store/useProfileStore";
import { useAppStore } from "@/store/useAppStore";
import type { MemberItem, RoleItem } from "@/store/useAppStore";
import { groupMembers, displayColorFor } from "@/lib/memberGroups";
import { ctxProps } from "./ContextMenu";

/** Yapper/Discord-style member list: ROLE - count headers, role-colored names. */
export function MemberList({
  members,
  roles,
  ownerId,
}: {
  members: MemberItem[];
  roles: RoleItem[];
  ownerId: string;
}) {
  const { openProfile } = useProfileStore();
  const groups = groupMembers(members, roles, { ownerId });

  return (
    <div>
      {groups.map((g) => (
        <div key={g.key} className="mb-3">
          <div className="mb-1 px-2 text-[11px] font-bold uppercase text-speakit-muted">
            {g.name} - {g.members.length}
          </div>
          {g.members.map((m) => {
            const color = displayColorFor(m, roles);
            const isOwner = m.id === ownerId || m.role === "owner";
            return (
              <button
                key={m.id}
                onClick={() => openProfile(m.id)}
                title={`@${m.username} — right-click for options`}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"
                {...ctxProps(() => [
                  { type: "header" as const, label: m.displayName },
                  { type: "item" as const, label: "View Profile", onClick: () => openProfile(m.id) },
                  {
                    type: "item" as const,
                    label: "Message",
                    onClick: async () => {
                      try {
                        const res = await fetch("/api/dms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: m.id }) });
                        const data = await res.json();
                        if (res.ok) {
                          await useAppStore.getState().refreshDMs();
                          useAppStore.getState().setActiveServer(null);
                          useAppStore.getState().setActiveDM(data.conversationId);
                        }
                      } catch {
                        /* ignore */
                      }
                    },
                  },
                  { type: "item" as const, label: "Copy User ID", onClick: () => void navigator.clipboard?.writeText(m.id).catch(() => {}) },
                ])}
              >
                <Avatar
                  name={m.displayName}
                  color={m.avatarColor}
                  src={m.avatarUrl || undefined}
                  size={32}
                  status={m.status}
                />
                <span
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm font-medium text-white"
                  style={color ? { color } : undefined}
                >
                  <span className="truncate">{m.displayName}</span>
                  {m.isBot && <BotTag />}
                  {isOwner && <Crown size={13} className="shrink-0 text-yellow-400" />}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
