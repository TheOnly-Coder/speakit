"use client";

import { useEffect, useState } from "react";
import { Modal } from "./ui";
import { Avatar } from "./Avatar";
import { useProfileStore } from "@/store/useProfileStore";

type Profile = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string;
  bannerUrl: string;
  status: string;
  customStatus: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  online: "🟢 Online",
  idle: "🌙 Idle",
  dnd: "⛔ Do not disturb",
  invisible: "⚫ Invisible",
  offline: "⚫ Offline",
};

export function ProfileModal() {
  const { openUserId, closeProfile } = useProfileStore();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!openUserId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${openUserId}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok) setProfile(data.user);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openUserId]);

  return (
    <Modal open={!!openUserId} onClose={closeProfile} title="">
      {!profile && <div className="py-6 text-center text-sm text-speakit-muted">Loading profile…</div>}
      {profile && (
        <div className="-m-0 overflow-hidden rounded-lg">
          <div
            className="h-24 w-full bg-cover bg-center"
            style={
              profile.bannerUrl
                ? { backgroundImage: `url(${profile.bannerUrl})` }
                : { backgroundColor: profile.avatarColor }
            }
          />
          <div className="px-2 pb-2">
            <div className="-mt-8 mb-2">
              <Avatar name={profile.displayName} color={profile.avatarColor} src={profile.avatarUrl || undefined} size={72} status={profile.status} />
            </div>
            <div className="rounded-lg bg-black/30 p-3">
              <div className="text-lg font-bold text-white">{profile.displayName}</div>
              <div className="text-sm text-speakit-muted">@{profile.username}</div>
              <div className="mt-2 border-t border-white/10 pt-2 text-xs">
                <div className="font-bold uppercase text-speakit-muted">Status</div>
                <div className="text-white">{STATUS_LABEL[profile.status] ?? profile.status}{profile.customStatus ? ` — ${profile.customStatus}` : ""}</div>
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 text-xs">
                <div className="font-bold uppercase text-speakit-muted">Member since</div>
                <div className="text-white">{new Date(profile.createdAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
