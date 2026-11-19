"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { submitTakedownAction } from "@/app/actions/takedown";
import { SAVE_IDLE } from "@/lib/saveState";

/**
 * "Deze foto laten verwijderen", vanuit de lightbox.
 *
 * Wie op een foto staat en die weg wil, moet dat kunnen vragen zonder eerst een
 * mailadres op te zoeken. Bewust geen login: wie op een VTK-foto staat is niet
 * per se lid, en een drempel hoort hier niet.
 *
 * Album en foto staan in verborgen velden; de bezoeker hoeft niet uit te leggen
 * over welke foto het gaat. De server zoekt ze daarna nog eens op in deze
 * galerij, dus een gemanipuleerd formulier levert niets op.
 */

export type TakedownLabels = {
  reportPhoto: string;
  takedownTitle: string;
  takedownIntro: string;
  takedownName: string;
  takedownEmail: string;
  takedownReason: string;
  takedownReasonOnPhoto: string;
  takedownReasonCopyright: string;
  takedownReasonOther: string;
  takedownMessage: string;
  takedownSubmit: string;
  takedownSending: string;
  takedownSent: string;
  takedownDone: string;
  takedownPrivacy: string;
  takedownFailed: string;
  takedownNameRequired: string;
  takedownNameTooLong: string;
  takedownEmailRequired: string;
  takedownEmailInvalid: string;
  takedownEmailTooLong: string;
  takedownReasonInvalid: string;
  takedownMessageTooLong: string;
  takedownPhotoUnknown: string;
  takedownRateLimited: string;
  takedownSaveFailed: string;
  close: string;
};

function FlagIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M5 21V4m0 0 6.5 1.8a4 4 0 0 0 2.6-.2L19 3.5v10l-4.9 2.1a4 4 0 0 1-2.6.2L5 14" />
    </svg>
  );
}

function isOutsideDialog(clientX: number, clientY: number, dialog: HTMLDialogElement) {
  const rect = dialog.getBoundingClientRect();
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}

export function TakedownDialog({
  albumSlug,
  assetId,
  photoTitle,
  labels,
  onOpenChange,
}: {
  albumSlug: string;
  assetId: string;
  photoTitle: string;
  labels: TakedownLabels;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitTakedownAction, SAVE_IDLE);
  const done = state.status === "success";
  const fieldId = useId();
  const titleId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const doneCloseBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const suppressCloseCountRef = useRef(0);
  const pressedOutsideRef = useRef(false);

  const errorMessages: Record<string, string> = {
    NAME_REQUIRED: labels.takedownNameRequired,
    NAME_TOO_LONG: labels.takedownNameTooLong,
    EMAIL_REQUIRED: labels.takedownEmailRequired,
    EMAIL_INVALID: labels.takedownEmailInvalid,
    EMAIL_TOO_LONG: labels.takedownEmailTooLong,
    REASON_INVALID: labels.takedownReasonInvalid,
    MESSAGE_TOO_LONG: labels.takedownMessageTooLong,
    PHOTO_UNKNOWN: labels.takedownPhotoUnknown,
    RATE_LIMITED: labels.takedownRateLimited,
    SAVE_FAILED: labels.takedownSaveFailed,
  };

  const errorMessage =
    state.status === "error"
      ? errorMessages[state.code] ?? state.detail ?? labels.takedownFailed
      : null;

  const openDialog = useCallback(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : triggerRef.current;
    setOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;

    if (open) {
      wasOpenRef.current = true;
      if (!openerRef.current) {
        openerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
      if (!dialog.contains(document.activeElement)) {
        closeBtnRef.current?.focus({ preventScroll: true });
      }

      return () => {
        if (dialog.open) {
          suppressCloseCountRef.current += 1;
          dialog.close();
        }
        const target = trigger?.isConnected ? trigger : openerRef.current;
        if (
          target?.isConnected &&
          (!document.activeElement || document.activeElement === document.body)
        ) {
          target.focus({ preventScroll: true });
        }
      };
    }

    if (dialog.open) {
      suppressCloseCountRef.current += 1;
      dialog.close();
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const target = trigger?.isConnected ? trigger : openerRef.current;
      openerRef.current = null;
      if (target?.isConnected) {
        target.focus({ preventScroll: true });
      }
    }
  }, [open]);

  useEffect(() => {
    if (open && done) {
      doneCloseBtnRef.current?.focus({ preventScroll: true });
    }
  }, [done, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="vtk-immich-icon-button"
        onClick={openDialog}
        title={labels.reportPhoto}
        aria-label={`${labels.reportPhoto}: ${photoTitle}`}
      >
        <FlagIcon />
      </button>

      <dialog
        ref={dialogRef}
        className="vtk-takedown-dialog"
        aria-labelledby={titleId}
        {...({ closedby: "any" } as Record<string, string>)}
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeDialog();
        }}
        onClose={(event) => {
          event.stopPropagation();
          if (suppressCloseCountRef.current > 0) {
            suppressCloseCountRef.current -= 1;
            return;
          }
          if (event.currentTarget.open) return;
          closeDialog();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          if ("closedBy" in HTMLDialogElement.prototype) {
            pressedOutsideRef.current = false;
            return;
          }
          pressedOutsideRef.current =
            event.target === event.currentTarget &&
            isOutsideDialog(event.clientX, event.clientY, event.currentTarget);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if ("closedBy" in HTMLDialogElement.prototype) return;
          const wasOutside = pressedOutsideRef.current;
          pressedOutsideRef.current = false;
          if (
            wasOutside &&
            event.target === event.currentTarget &&
            isOutsideDialog(event.clientX, event.clientY, event.currentTarget)
          ) {
            closeDialog();
          }
        }}
      >
        {open ? (
          <div className="vtk-takedown-panel">
            <div className="vtk-takedown-head">
              <div>
                <h2 id={titleId}>{labels.takedownTitle}</h2>
                <p>{photoTitle}</p>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                className="vtk-takedown-close"
                onClick={closeDialog}
                title={labels.close}
                aria-label={labels.close}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {done ? (
              <div className="vtk-takedown-done" role="status" aria-live="polite">
                <p>{labels.takedownDone}</p>
                <button
                  ref={doneCloseBtnRef}
                  type="button"
                  className="vtk-button vtk-button-primary"
                  onClick={closeDialog}
                >
                  {labels.close}
                </button>
              </div>
            ) : (
              <form className="vtk-takedown-form" onSubmit={handleSubmit}>
                <p className="vtk-takedown-intro">{labels.takedownIntro}</p>

                {errorMessage ? (
                  <p role="alert" id={errorId} className="vtk-takedown-error">
                    {errorMessage}
                  </p>
                ) : null}

                <input type="hidden" name="albumSlug" value={albumSlug} />
                <input type="hidden" name="assetId" value={assetId} />
                {/* Honeypot: onzichtbaar voor mensen, onweerstaanbaar voor bots. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="vtk-immich-visually-hidden"
                />

                <label htmlFor={`${fieldId}-name`}>
                  <span>{labels.takedownName}</span>
                  <input
                    id={`${fieldId}-name`}
                    name="name"
                    required
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>

                <label htmlFor={`${fieldId}-email`}>
                  <span>{labels.takedownEmail}</span>
                  <input
                    id={`${fieldId}-email`}
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                  />
                </label>

                <label htmlFor={`${fieldId}-reason`}>
                  <span>{labels.takedownReason}</span>
                  <select id={`${fieldId}-reason`} name="reason" defaultValue="ON_PHOTO" required>
                    <option value="ON_PHOTO">{labels.takedownReasonOnPhoto}</option>
                    <option value="COPYRIGHT">{labels.takedownReasonCopyright}</option>
                    <option value="OTHER">{labels.takedownReasonOther}</option>
                  </select>
                </label>

                <label htmlFor={`${fieldId}-message`}>
                  <span>{labels.takedownMessage}</span>
                  <textarea id={`${fieldId}-message`} name="message" rows={3} maxLength={2000} />
                </label>

                <p className="vtk-takedown-privacy">{labels.takedownPrivacy}</p>

                <div>
                  <button
                    type="submit"
                    className="vtk-button vtk-button-primary"
                    disabled={pending}
                  >
                    {pending ? labels.takedownSending : labels.takedownSubmit}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
