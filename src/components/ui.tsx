"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="modal-pop relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-speakit-card/95 p-6 shadow-pop backdrop-blur-xl">
        <h2 className="mb-4 text-xl font-extrabold tracking-tight text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-speakit-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-white/10 bg-speakit-input px-3.5 py-2.5 text-sm text-white shadow-inner placeholder:text-speakit-muted/70 outline-none transition focus:border-speakit-blurple/60 focus:ring-2 focus:ring-speakit-blurple/30";

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "brand-gradient w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-glow transition-all hover:brightness-110 hover:saturate-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        className
      )}
    >
      {children}
    </button>
  );
}

export function useModal() {
  const [open, setOpen] = useState(false);
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false), setOpen };
}
