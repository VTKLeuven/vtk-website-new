"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";

type Props = {
  open: boolean;
  title: string;
  /** Body text or nodes explaining what is about to happen. */
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Use the danger styling for the confirm button (default true for destructive actions). */
  destructive?: boolean;
  /** Disable the confirm button, e.g. while the action is pending. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Bevestigings-modal voor onomkeerbare acties (zie CLAUDE.md > UX-conventies).
 * Toon deze altijd voor je iets verwijdert; gebruik geen kale delete-knop of
 * native `confirm()`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-vtk-ink">{title}</h2>
        {description ? <div className="mt-2 text-sm text-[#5c667f]">{description}</div> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
