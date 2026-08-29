"use client";

import { useEffect, useId, useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { submitTakedownAction } from "@/app/actions/takedown";

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

export function TakedownDialog({
  albumSlug,
  assetId,
  photoTitle,
  labels,
}: {
  albumSlug: string;
  assetId: string;
  photoTitle: string;
  labels: TakedownLabels;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const fieldId = useId();

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

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="vtk-immich-icon-button"
        onClick={() => setOpen(true)}
        title={labels.reportPhoto}
        aria-label={`${labels.reportPhoto}: ${photoTitle}`}
      >
        <FlagIcon />
      </button>

      {open ? (
        <div
          className="vtk-takedown-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={labels.takedownTitle}
          onClick={() => setOpen(false)}
        >
          <div className="vtk-takedown-panel" onClick={(event) => event.stopPropagation()}>
            <div className="vtk-takedown-head">
              <div>
                <h2>{labels.takedownTitle}</h2>
                <p>{photoTitle}</p>
              </div>
              <button
                type="button"
                className="vtk-takedown-close"
                onClick={() => setOpen(false)}
                title={labels.close}
                aria-label={labels.close}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {done ? (
              <div className="vtk-takedown-done">
                <p>{labels.takedownDone}</p>
                <button type="button" className="vtk-button vtk-button-primary" onClick={() => setOpen(false)}>
                  {labels.close}
                </button>
              </div>
            ) : (
              <SaveForm
                action={submitTakedownAction}
                submitLabel={labels.takedownSubmit}
                savingLabel={labels.takedownSending}
                savedMessage={labels.takedownSent}
                errorMessages={errorMessages}
                fallbackErrorMessage={labels.takedownFailed}
                onSuccess={() => setDone(true)}
                className="vtk-takedown-form"
              >
                <p className="vtk-takedown-intro">{labels.takedownIntro}</p>

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
                  <input id={`${fieldId}-name`} name="name" required maxLength={120} autoComplete="name" />
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
              </SaveForm>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
