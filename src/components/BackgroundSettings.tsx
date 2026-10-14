"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, MonitorSmartphone } from "lucide-react";
import { useLocalAppearance, fileToBackgroundDataUrl, type BgFit } from "@/store/useLocalAppearance";

const FITS: { id: BgFit; label: string; hint: string }[] = [
  { id: "cover", label: "Fill", hint: "Crops to fill the screen (Discord-like)" },
  { id: "contain", label: "Fit", hint: "Whole image, letterboxed" },
  { id: "fill", label: "Stretch", hint: "Stretches to fill" },
  { id: "tile", label: "Tile", hint: "Repeats as a pattern" },
];

/**
 * Local-only background picker. The image is downscaled in-browser and kept in
 * IndexedDB on THIS device — it is never uploaded to Speakit servers.
 */
export function BackgroundSettings() {
  const image = useLocalAppearance((s) => s.image);
  const enabled = useLocalAppearance((s) => s.enabled);
  const dim = useLocalAppearance((s) => s.dim);
  const blur = useLocalAppearance((s) => s.blur);
  const opacity = useLocalAppearance((s) => s.opacity);
  const fit = useLocalAppearance((s) => s.fit);
  const patch = useLocalAppearance((s) => s.patch);
  const setImage = useLocalAppearance((s) => s.setImage);
  const reset = useLocalAppearance((s) => s.reset);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (PNG, JPG, GIF, WebP).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("That file is over 15 MB — pick a smaller one.");
      return;
    }
    setBusy(true);
    try {
      const { dataUrl } = await fileToBackgroundDataUrl(file);
      await setImage(dataUrl);
      patch({ enabled: true });
    } catch {
      setError("Couldn't read that image. Try a PNG or JPG.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <MonitorSmartphone size={16} className="text-speakit-muted" />
        Chat background <span className="rounded bg-speakit-green/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-speakit-green">This device only</span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-speakit-muted">
        Upload an image to sit behind Speakit. It stays in your browser&apos;s local storage — it is never
        uploaded, never synced, and nobody else can see it. Removing it or switching devices removes it.
      </p>

      {/* Preview / dropzone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`relative mb-3 flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed transition ${
          dragOver ? "border-speakit-blurple bg-speakit-blurple/10" : "border-white/15 bg-black/30 hover:border-white/30"
        }`}
        title="Click or drop an image here"
        style={image ? { backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {image && <div className="absolute inset-0 bg-black/55" />}
        <div className="relative flex flex-col items-center gap-1 text-xs text-white">
          <ImagePlus size={20} />
          <span className="font-semibold">{busy ? "Processing…" : image ? "Click or drop to replace" : "Click or drop an image to upload"}</span>
          <span className="text-[11px] text-speakit-muted">PNG · JPG · GIF · WebP — resized on-device, max ~1920px</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {error && <div className="mb-2 text-xs text-red-400">{error}</div>}

      {image && (
        <>
          <label className="mb-2 flex cursor-pointer items-center justify-between rounded-md bg-speakit-input px-3 py-2 text-sm">
            <span className="text-white">Show background</span>
            <input type="checkbox" checked={enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="h-4 w-4 accent-[#5865f2]" />
          </label>

          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between text-xs text-speakit-muted">
              <span className="font-bold uppercase">Dim (readability)</span>
              <span>{Math.round(dim * 100)}%</span>
            </div>
            <input type="range" min={0} max={90} value={Math.round(dim * 100)} onChange={(e) => patch({ dim: Number(e.target.value) / 100 })} className="w-full accent-[#5865f2]" />
          </div>

          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between text-xs text-speakit-muted">
              <span className="font-bold uppercase">Image opacity</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })} className="w-full accent-[#5865f2]" />
          </div>

          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-speakit-muted">
              <span className="font-bold uppercase">Blur</span>
              <span>{blur}px</span>
            </div>
            <input type="range" min={0} max={20} value={blur} onChange={(e) => patch({ blur: Number(e.target.value) })} className="w-full accent-[#5865f2]" />
          </div>

          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {FITS.map((f) => (
              <button
                key={f.id}
                onClick={() => patch({ fit: f.id })}
                title={f.hint}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold ${fit === f.id ? "bg-speakit-blurple text-white" : "bg-speakit-input text-speakit-muted hover:text-white"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => void setImage(null)} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20">
              <Trash2 size={13} /> Remove background
            </button>
            <button onClick={() => void reset()} className="rounded-md px-3 py-2 text-xs text-speakit-muted hover:text-red-400" title="Reset all local appearance settings on this device">
              Reset all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
