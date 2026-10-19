import type { User } from "@prisma/client";

export type SafeUser = Pick<
  User,
  "id" | "email" | "username" | "displayName" | "avatarColor" | "avatarUrl" | "bannerUrl" | "status" | "customStatus" | "bio" | "links" | "nameFont" | "nameColor" | "nameGradient" | "createdAt"
>;

export function toSafeUser(u: User): SafeUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl,
    bannerUrl: u.bannerUrl,
    status: u.status,
    customStatus: u.customStatus,
    bio: u.bio,
    links: u.links,
    nameFont: u.nameFont,
    nameColor: u.nameColor,
    nameGradient: u.nameGradient,
    createdAt: u.createdAt,
  };
}
