import { create } from "zustand";

type Theme = "dark" | "light";

type ThemeState = {
  theme: Theme;
  toggle: () => void;
  apply: () => void;
};

function initial(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("speakit-theme");
  return saved === "light" ? "light" : "dark";
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: typeof window === "undefined" ? "dark" : initial(),
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem("speakit-theme", next);
    } catch {
      /* ignore */
    }
    set({ theme: next });
    get().apply();
  },
  apply: () => {
    if (typeof document === "undefined") return;
    const dark = get().theme !== "light";
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  },
}));
