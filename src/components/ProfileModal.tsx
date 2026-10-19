"use client";

import { useEffect, useState } from "react";
import { Modal } from "./ui";
import { Avatar } from "./Avatar";
import { useProfileStore } from "@/store/useProfileStore";
import { useAppStore } from "@/store/useAppStore";

type Profile = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string;
  bannerUrl: string;
  status: string;
  customStatus: string;
  bio: string;
  links: string;
  nameFont: string;
  nameColor: string;
  nameGradient: string;
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
  const { serverDetail } = useAppStore();
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

  const member = serverDetail?.members.find((m) => m.id === openUserId);
  const roles = serverDetail?.roles.filter((r) => member?.roleIds?.includes(r.id)) ?? [];
  const nameStyle: React.CSSProperties = profile?.nameGradient
    ? { backgroundImage: profile.nameGradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontFamily: profile.nameFont || undefined }
    : { color: profile?.nameColor || undefined, fontFamily: profile?.nameFont || undefined };

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
              <div className="text-lg font-bold text-white" style={nameStyle}>{profile.displayName}</div>
              <div className="text-sm text-speakit-muted">@{profile.username}</div>
              {profile.customStatus && <div className="mt-1 text-sm text-speakit-text">{profile.customStatus}</div>}
              {profile.bio && (
                <div className="mt-2 border-t border-white/10 pt-2 text-sm text-white whitespace-pre-wrap">{profile.bio}</div>
              )}
              {profile.links && (
                <div className="mt-2 border-t border-white/10 pt-2 text-xs">
                  <div className="font-bold uppercase text-speakit-muted">Links</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {profile.links.split(",").map((l) => l.trim()).filter(Boolean).map((l) => (
                      <a key={l} href={l.startsWith("http") ? l : `https://${l}`} target="_blank" rel="noreferrer" className="text-speakit-blurple hover:underline">{l}</a>
                    ))}
                  </div>
                </div>
              )}
              {roles.length > 0 && (
                <div className="mt-2 border-t border-white/10 pt-2 text-xs">
                  <div className="font-bold uppercase text-speakit-muted">Roles</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {roles.map((r) => (
                      <span key={r.id} className="rounded-md px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: r.color }}>{r.name}</span>
                    ))}
                  </div>
                </div>
              )}
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
