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
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="modal-pop relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl bg-speakit-sidebar p-6 shadow-2xl ring-1 ring-black/60">
        <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
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
  "w-full rounded-md bg-speakit-input px-3 py-2 text-sm text-white placeholder:text-speakit-muted outline-none focus:ring-2 focus:ring-speakit-blurple";

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
        "w-full rounded-md bg-speakit-blurple px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50",
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
