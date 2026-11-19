"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pressedOutsideRef = useRef(false);
  const suppressCloseCountRef = useRef(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!open) {
      if (dialog.open) {
        suppressCloseCountRef.current += 1;
        dialog.close();
      }
      return;
    }

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    cancelRef.current?.focus();

    return () => {
      if (dialog.open) {
        suppressCloseCountRef.current += 1;
        dialog.close();
      }
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) {
        opener.focus();
      }
    };
  }, [open]);

  function isOutsideDialog(clientX: number, clientY: number, dialog: HTMLDialogElement) {
    const rect = dialog.getBoundingClientRect();
    return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      {...({ closedby: pending ? "none" : "any" } as Record<string, string>)}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      onClose={(e) => {
        if (suppressCloseCountRef.current > 0) {
          suppressCloseCountRef.current -= 1;
          return;
        }
        if (e.currentTarget.open) return;
        if (open && !pending) onCancel();
      }}
      onPointerDown={(e) => {
        if (pending || "closedBy" in HTMLDialogElement.prototype) {
          pressedOutsideRef.current = false;
          return;
        }
        pressedOutsideRef.current = e.target === e.currentTarget && isOutsideDialog(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerUp={(e) => {
        if (pending || "closedBy" in HTMLDialogElement.prototype) return;
        const wasOutside = pressedOutsideRef.current;
        pressedOutsideRef.current = false;
        if (wasOutside && e.target === e.currentTarget && isOutsideDialog(e.clientX, e.clientY, e.currentTarget)) {
          onCancel();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-vtk-muted/60 bg-vtk-surface-elevated p-0 text-vtk-ink shadow-lg backdrop:bg-zinc-900/45"
    >
      {open ? (
        <div className="p-5">
          <h2 id={titleId} className="font-semibold text-vtk-ink">
            {title}
          </h2>
          {description ? (
            <div id={descId} className="mt-2 text-sm text-vtk-muted">
              {description}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
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
      ) : null}
    </dialog>
  );
}
