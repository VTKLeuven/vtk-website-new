"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  removeGuestInterestAction,
  setEventInterestAction,
  setGuestInterestAction,
} from "@/app/actions/eventInterest";
import { StarIcon } from "@/components/ui/icons";
import { SAVE_IDLE, type SaveState } from "@/lib/saveState";
import type { ViewerInterest } from "@/lib/calendar/interest";

/**
 * Interesse in een evenement, gedeeld door de eventpagina en de kalendermodal.
 *
 * Bij een alumni-evenement opent na het aanduiden automatisch het korte blok
 * met zelf ingevulde gegevens. Die waarden horen bij dit evenement en worden
 * nooit uit het accountprofiel gehaald. Elk veld heeft daarnaast een aparte
 * toestemming voor de publieke lijst "Wie er komt".
 */

type Labels = {
  interested: string;
  removeInterest: string;
  saving: string;
  countLine: string | null;
  loginCta: string;
  detailsHeading: string;
  detailsHint: string;
  name: string;
  namePlaceholder: string;
  showName: string;
  graduationYear: string;
  showGraduationYear: string;
  wasInVtk: string;
  showWasInVtk: string;
  perEventHint: string;
  saveDetails: string;
  detailsSaved: string;
  errorVisibleValue: string;
  errorGeneric: string;
};

type JoinedViewer = Exclude<ViewerInterest, { kind: "none" }>;

function emptyViewer(kind: "member" | "guest"): JoinedViewer {
  return {
    kind,
    displayName: null,
    graduationYear: null,
    wasInVtk: false,
    showName: false,
    showGraduationYear: false,
    showWasInVtk: false,
  };
}

function viewerFromForm(kind: "member" | "guest", formData: FormData): JoinedViewer {
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const rawYear = String(formData.get("graduationYear") ?? "").trim();
  return {
    kind,
    displayName,
    graduationYear: /^\d{4}$/.test(rawYear) ? Number(rawYear) : null,
    wasInVtk: formData.get("wasInVtk") === "on",
    showName: formData.get("showName") === "on" && displayName !== null,
    showGraduationYear: formData.get("showGraduationYear") === "on" && /^\d{4}$/.test(rawYear),
    showWasInVtk: formData.get("showWasInVtk") === "on",
  };
}

export function EventInterest({
  eventId,
  isAlumniEvent,
  signedIn,
  viewer,
  loginHref,
  labels,
  onChanged,
}: {
  eventId: string;
  isAlumniEvent: boolean;
  signedIn: boolean;
  viewer: ViewerInterest;
  loginHref: string;
  labels: Labels;
  onChanged?: (viewer: ViewerInterest) => void;
}) {
  const [current, setCurrent] = useState<ViewerInterest>(viewer);
  const joined = current.kind !== "none";

  const [toggleState, toggleAction, togglePending] = useActionState<SaveState, FormData>(
    async (_previous, formData) => {
      let state: SaveState;
      if (current.kind === "guest") {
        state = await removeGuestInterestAction(SAVE_IDLE, formData);
      } else if (current.kind === "member") {
        state = await setEventInterestAction(SAVE_IDLE, formData);
      } else if (signedIn) {
        state = await setEventInterestAction(SAVE_IDLE, formData);
      } else {
        state = await setGuestInterestAction(SAVE_IDLE, formData);
      }

      if (state.status === "success") {
        const next: ViewerInterest = joined
          ? { kind: "none" }
          : emptyViewer(signedIn ? "member" : "guest");
        setCurrent(next);
        onChanged?.(next);
      }
      return state;
    },
    SAVE_IDLE,
  );

  if (!signedIn && !isAlumniEvent) {
    return (
      <Link href={loginHref} className="btn btn-ghost vtk-interest-toggle ev-preview-go">
        <span className="vtk-interest-star" aria-hidden>
          <StarIcon />
        </span>
        {labels.loginCta}
      </Link>
    );
  }

  function saveCurrent(next: JoinedViewer) {
    setCurrent(next);
    onChanged?.(next);
  }

  return (
    <>
      <form action={toggleAction} className="vtk-interest-inline">
        <input type="hidden" name="eventId" value={eventId} />
        {current.kind === "member" ? (
          <input type="hidden" name="interested" value="off" />
        ) : current.kind === "none" && signedIn ? (
          <input type="hidden" name="interested" value="on" />
        ) : null}
        <button
          type="submit"
          className={
            joined
              ? "btn btn-ghost vtk-interest-toggle ev-preview-go is-active"
              : "btn btn-primary vtk-interest-toggle ev-preview-go"
          }
          disabled={togglePending}
          aria-pressed={joined}
          aria-busy={togglePending}
        >
          <span className="vtk-interest-star" aria-hidden>
            <StarIcon />
          </span>
          {togglePending ? (
            labels.saving
          ) : joined ? (
            <>
              <span className="ev-interest-default">{labels.interested}</span>
              <span className="ev-interest-hover">{labels.removeInterest}</span>
            </>
          ) : (
            labels.interested
          )}
        </button>
      </form>

      {labels.countLine ? <span className="vtk-interest-pill">{labels.countLine}</span> : null}

      {toggleState.status === "error" ? (
        <p className="vtk-interest-error vtk-interest-toggle-error" role="alert">
          {labels.errorGeneric}
        </p>
      ) : null}

      {isAlumniEvent && current.kind !== "none" ? (
        <AlumniAttendanceForm
          key={`${eventId}:${current.kind}`}
          eventId={eventId}
          viewer={current}
          signedIn={signedIn}
          labels={labels}
          onSaved={saveCurrent}
        />
      ) : null}
    </>
  );
}

function AlumniAttendanceForm({
  eventId,
  viewer,
  signedIn,
  labels,
  onSaved,
}: {
  eventId: string;
  viewer: JoinedViewer;
  signedIn: boolean;
  labels: Labels;
  onSaved: (viewer: JoinedViewer) => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async (_previous, formData) => {
      const result = signedIn
        ? await setEventInterestAction(SAVE_IDLE, formData)
        : await setGuestInterestAction(SAVE_IDLE, formData);
      if (result.status === "success") {
        onSaved(viewerFromForm(signedIn ? "member" : "guest", formData));
      }
      return result;
    },
    SAVE_IDLE,
  );

  const nameId = `interest-name-${eventId}`;
  const yearId = `interest-year-${eventId}`;

  return (
    <section className="vtk-interest-expand" aria-labelledby={`interest-heading-${eventId}`}>
      <div className="vtk-interest-copy">
        <h3 id={`interest-heading-${eventId}`}>{labels.detailsHeading}</h3>
        <p>{labels.detailsHint}</p>
      </div>

      <form action={formAction} className="vtk-interest-details-form">
        <input type="hidden" name="eventId" value={eventId} />
        {signedIn ? <input type="hidden" name="interested" value="on" /> : null}

        <div className="vtk-interest-fields">
          <div className="vtk-interest-field">
            <label htmlFor={nameId}>{labels.name}</label>
            <input
              id={nameId}
              name="displayName"
              maxLength={80}
              defaultValue={viewer.displayName ?? ""}
              placeholder={labels.namePlaceholder}
              autoComplete="name"
            />
            <label className="vtk-interest-check">
              <input type="checkbox" name="showName" defaultChecked={viewer.showName} />
              {labels.showName}
            </label>
          </div>

          <div className="vtk-interest-field">
            <label htmlFor={yearId}>{labels.graduationYear}</label>
            <input
              id={yearId}
              name="graduationYear"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              placeholder="2004"
              defaultValue={viewer.graduationYear ?? ""}
            />
            <label className="vtk-interest-check">
              <input
                type="checkbox"
                name="showGraduationYear"
                defaultChecked={viewer.showGraduationYear}
              />
              {labels.showGraduationYear}
            </label>
          </div>

          <div className="vtk-interest-field vtk-interest-praesidium">
            <label className="vtk-interest-check vtk-interest-answer">
              <input type="checkbox" name="wasInVtk" defaultChecked={viewer.wasInVtk} />
              {labels.wasInVtk}
            </label>
            <label className="vtk-interest-check">
              <input type="checkbox" name="showWasInVtk" defaultChecked={viewer.showWasInVtk} />
              {labels.showWasInVtk}
            </label>
          </div>
        </div>

        <p className="vtk-interest-note">{labels.perEventHint}</p>

        {state.status === "error" ? (
          <p className="vtk-interest-error" role="alert">
            {state.code === "MISSING_VISIBLE_VALUE"
              ? labels.errorVisibleValue
              : labels.errorGeneric}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p className="vtk-interest-done" role="status">
            {labels.detailsSaved}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? labels.saving : labels.saveDetails}
        </button>
      </form>
    </section>
  );
}
