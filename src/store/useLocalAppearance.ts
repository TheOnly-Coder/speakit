"use client";

import { create } from "zustand";

export type BgFit = "cover" | "contain" | "fill" | "tile";

export type BgSettings = {
  enabled: boolean;
  dim: number; // 0..0.9 dark overlay so text stays readable
  blur: number; // 0..20 px
  opacity: number; // 0.1..1 image opacity
  fit: BgFit;
  // local-only appearance prefs (Discord-like, per-device)
  fontScale: number; // 0.85..1.3
  compact: boolean; // cozy vs compact message density
  showTimestamps: boolean;
  reduceMotion: boolean;
  desktopSounds: boolean;
  enterToSend: boolean;
};

const DEFAULTS: BgSettings = {
  enabled: true,
  dim: 0.72,
  blur: 0,
  opacity: 1,
  fit: "cover",
  fontScale: 1,
  compact: false,
  showTimestamps: true,
  reduceMotion: false,
  desktopSounds: true,
  enterToSend: true,
};

const SETTINGS_KEY = "speakit-local-appearance-v1";
const IDB_NAME = "speakit-local";
const IDB_STORE = "kv";
const IDB_BG_KEY = "background-image-dataurl";

function loadSettings(): BgSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<BgSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function persistSettings(s: BgSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — ignore */
  }
}

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);
        req.onsuccess = () => {
          db.close();
          resolve(typeof req.result === "string" ? req.result : null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: string): Promise<boolean> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        const req = store.put(value, key);
        req.onsuccess = () => {
          db.close();
          resolve(true);
        };
        req.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch {
        db.close();
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

async function idbDel(key: string): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  } catch {
    /* ignore */
  }
}

type BgState = BgSettings & {
  /** dataURL of the local background image (never uploaded anywhere) */
  image: string | null;
  imageLoaded: boolean;
  setImage: (dataUrl: string | null) => Promise<void>;
  patch: (p: Partial<BgSettings>) => void;
  reset: () => Promise<void>;
  loadImage: () => Promise<void>;
};

export const useLocalAppearance = create<BgState>((set, get) => ({
  ...loadSettings(),
  image: null,
  imageLoaded: false,

  patch: (p) => {
    const next: BgSettings = { ...get(), ...p };
    const { image: _img, imageLoaded: _l, setImage: _s, patch: _p, reset: _r, loadImage: _li, ...settings } = next as BgState;
    void _img;
    void _l;
    void _s;
    void _p;
    void _r;
    void _li;
    persistSettings(settings as BgSettings);
    set(p);
    applyCssVars(get());
  },

  setImage: async (dataUrl) => {
    if (!dataUrl) {
      await idbDel(IDB_BG_KEY);
      // also clear any legacy localStorage copy
      try {
        window.localStorage.removeItem("speakit-bg-image");
      } catch {
        /* ignore */
      }
      set({ image: null, imageLoaded: true });
      return;
    }
    const ok = await idbSet(IDB_BG_KEY, dataUrl);
    if (!ok) {
      // IndexedDB failed (private mode?) — fall back to localStorage attempt
      try {
        window.localStorage.setItem("speakit-bg-image", dataUrl);
      } catch {
        /* quota — still show for this session */
      }
    }
    set({ image: dataUrl, imageLoaded: true });
  },

  reset: async () => {
    await idbDel(IDB_BG_KEY);
    try {
      window.localStorage.removeItem("speakit-bg-image");
      window.localStorage.removeItem(SETTINGS_KEY);
    } catch {
      /* ignore */
    }
    set({ ...DEFAULTS, image: null, imageLoaded: true });
    applyCssVars({ ...DEFAULTS } as BgState);
  },

  loadImage: async () => {
    if (get().imageLoaded) return;
    try {
      let data = await idbGet(IDB_BG_KEY);
      if (!data) {
        // legacy: tiny images may live in localStorage from older builds
        try {
          data = window.localStorage.getItem("speakit-bg-image");
        } catch {
          data = null;
        }
        if (data) {
          // migrate to IndexedDB quietly
          void idbSet(IDB_BG_KEY, data);
        }
      }
      set({ image: data, imageLoaded: true });
    } catch {
      set({ image: null, imageLoaded: true });
    }
  },
}));

export function applyCssVars(s: { fontScale: number; compact: boolean; reduceMotion: boolean }) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--speakit-font-scale", String(s.fontScale));
  root.classList.toggle("speakit-compact", !!s.compact);
  root.classList.toggle("speakit-reduce-motion", !!s.reduceMotion);
}

/** Downscale + compress an uploaded file to a device-local dataURL (never uploaded). */
export async function fileToBackgroundDataUrl(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const MAX = 1920;
  // Preferred path: createImageBitmap (Chrome/Edge/Firefox).
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(bitmap, 0, 0, w, h);
      // JPEG keeps local storage small. GIF uploads become a still frame
      // (animated backgrounds would eat RAM).
      return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), w, h };
    } finally {
      bitmap.close();
    }
  } catch {
    // Safari fallback via <img>.
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
