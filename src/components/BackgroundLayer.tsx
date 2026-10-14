"use client";

import { useEffect } from "react";
import { useLocalAppearance } from "@/store/useLocalAppearance";
import { applyCssVars } from "@/store/useLocalAppearance";

/**
 * Fixed full-app background layer for the local-only custom background.
 * Rendered once at the top level; pointer-events-none so it never blocks clicks.
 * The image NEVER leaves the device (IndexedDB only, never uploaded).
 */
export function BackgroundLayer() {
  const image = useLocalAppearance((s) => s.image);
  const imageLoaded = useLocalAppearance((s) => s.imageLoaded);
  const loadImage = useLocalAppearance((s) => s.loadImage);
  const enabled = useLocalAppearance((s) => s.enabled);
  const dim = useLocalAppearance((s) => s.dim);
  const blur = useLocalAppearance((s) => s.blur);
  const opacity = useLocalAppearance((s) => s.opacity);
  const fit = useLocalAppearance((s) => s.fit);

  useEffect(() => {
    void loadImage();
  }, [loadImage]);

  useEffect(() => {
    applyCssVars(useLocalAppearance.getState());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("speakit-has-bg", !!image && enabled);
  }, [image, enabled]);

  if (!imageLoaded || !enabled || !image) return null;

  const size =
    fit === "cover" ? "cover" : fit === "contain" ? "contain" : fit === "fill" ? "100% 100%" : "auto";
  const repeat = fit === "tile" ? "repeat" : "no-repeat";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: size,
          backgroundRepeat: repeat,
          backgroundPosition: "center",
          opacity,
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
          transform: blur > 0 ? "scale(1.03)" : undefined, // hide blur edge bleed
        }}
      />
      {/* Readability veil — keeps text legible over busy photos, Discord-style */}
      <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />
    </div>
  );
}
