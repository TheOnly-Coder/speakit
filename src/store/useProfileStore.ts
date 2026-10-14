import { create } from "zustand";

type ProfileState = {
  openUserId: string | null;
  openProfile: (userId: string) => void;
  closeProfile: () => void;
};

export const useProfileStore = create<ProfileState>((set) => ({
  openUserId: null,
  openProfile: (userId) => set({ openUserId: userId }),
  closeProfile: () => set({ openUserId: null }),
}));
