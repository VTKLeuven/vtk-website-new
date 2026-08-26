"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  removeGuestInterestAction,
  setEventInterestAction,
  setGuestInterestAction,
} from "@/app/actions/eventInterest";
import { SAVE_IDLE, type SaveState } from "@/lib/saveState";
import type { ViewerInterest } from "@/lib/calendar/interest";

/**
 * "Ik kom naar dit evenement" op de eventpagina.
 *
 * Staat bewust **in de knoppenrij** naast "Tickets kopen" en "Zet in mijn
 * agenda", en niet in een eigen kaart eronder. Het is dezelfde soort beslissing
 * als die twee ("wat doe ik met dit evenement?"), en een eigen box eronder
 * maakte er een tweede, zwaarder ogende sectie van die je pas zag na de
 * beschrijving.
 *
 * Wat er méér nodig is dan één knop, klapt eronder open over de volle breedte
 * van de rij:
 *
 * - bij een **alumni-evenement** de drie vakjes waarmee je kiest wat er in de
 *   publieke aanwezigheidslijst mag staan (alles standaard uit);
 * - voor een bezoeker **zonder account** bij zo'n evenement het korte formulier
 *   met afstudeerjaar en VTK-verleden. Zonder account bij een gewoon evenement
 *   is er niets om open te klappen: daar is inloggen het antwoord.
 */

type Labels = {
  join: string;
  joined: string;
  leave: string;
  saving: string;
  countLine: string | null;
  loginCta: string;
  showHeading: string;
  showHint: string;
  showName: string;
  showGraduationYear: string;
  showWasInVtk: string;
  showSave: string;
  showToggle: string;
  guestIntro: string;
  guestName: string;
  guestNameHint: string;
  guestYear: string;
  guestWasInVtk: string;
  guestSubmit: string;
  guestUpdate: string;
  guestRemove: string;
  guestDone: string;
  errorNothing: string;
  errorGeneric: string;
  profileHint: string;
  profileLink: string;
};

export function EventInterest({
  eventId,
  isAlumniEvent,
  signedIn,
  viewer,
  accountHref,
  loginHref,
  labels,
}: {
  eventId: string;
  isAlumniEvent: boolean;
  signedIn: boolean;
  viewer: ViewerInterest;
  accountHref: string;
  loginHref: string;
  labels: Labels;
}) {
  if (signedIn) {
    return (
      <MemberInterest
        eventId={eventId}
        isAlumniEvent={isAlumniEvent}
        viewer={viewer}
        accountHref={accountHref}
        labels={labels}
      />
    );
  }

  if (isAlumniEvent) {
    return <GuestInterest eventId={eventId} viewer={viewer} labels={labels} />;
  }

  // Gewoon evenement zonder account: één account telt één keer, en dat is wat de
  // teller bruikbaar houdt. Inloggen is hier dus het hele antwoord.
  return (
    <Link href={loginHref} className="btn btn-ghost">
      {labels.loginCta}
    </Link>
  );
}

function MemberInterest({
  eventId,
  isAlumniEvent,
  viewer,
  accountHref,
  labels,
}: {
  eventId: string;
  isAlumniEvent: boolean;
  viewer: ViewerInterest;
  accountHref: string;
  labels: Labels;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    setEventInterestAction,
    SAVE_IDLE,
  );
  const joined = viewer.kind === "member";
  // De vakjes staan dicht zolang niemand ze nodig heeft; wie al zichtbaar is,
  // hoort meteen te zien wát er van hem in de lijst staat.
  const [open, setOpen] = useState(
    viewer.kind === "member" &&
      (viewer.showName || viewer.showGraduationYear || viewer.showWasInVtk),
  );

  return (
    <>
      <form action={formAction} className="vtk-interest-inline">
        <input type="hidden" name="eventId" value={eventId} />
        {/* De vakjes hieronder horen bij dezelfde submit; staan ze dicht, dan
            gaan hun huidige waarden als hidden inputs mee zodat een klik op de
            knop ze niet stilletjes uitzet. */}
        {isAlumniEvent && !open ? <HiddenShowFlags viewer={viewer} /> : null}
        <button
          type="submit"
          name="interested"
          value={joined ? "off" : "on"}
          className={joined ? "btn btn-ghost" : "btn btn-primary"}
          disabled={pending}
          aria-pressed={joined}
        >
          {pending ? labels.saving : joined ? labels.joined : labels.join}
        </button>
      </form>

      {isAlumniEvent ? (
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(!open)}>
          {labels.showToggle}
        </button>
      ) : null}

      {labels.countLine ? <span className="vtk-interest-pill">{labels.countLine}</span> : null}

      {isAlumniEvent && open ? (
        <form action={formAction} className="vtk-interest-expand">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="interested" value="on" />
          <fieldset className="vtk-interest-show">
            <legend>{labels.showHeading}</legend>
            <p>{labels.showHint}</p>
            <label>
              <input
                type="checkbox"
                name="showName"
                defaultChecked={viewer.kind === "member" && viewer.showName}
              />
              {labels.showName}
            </label>
            <label>
              <input
                type="checkbox"
                name="showGraduationYear"
                defaultChecked={viewer.kind === "member" && viewer.showGraduationYear}
              />
              {labels.showGraduationYear}
            </label>
            <label>
              <input
                type="checkbox"
                name="showWasInVtk"
                defaultChecked={viewer.kind === "member" && viewer.showWasInVtk}
              />
              {labels.showWasInVtk}
            </label>
            <p className="vtk-interest-note">
              {labels.profileHint}{" "}
              <Link href={accountHref} className="vtk-link">
                {labels.profileLink}
              </Link>
            </p>
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {labels.showSave}
          </button>
          {state.status === "error" ? (
            <p className="vtk-interest-error">{labels.errorGeneric}</p>
          ) : null}
        </form>
      ) : null}
    </>
  );
}

/** Houdt de zichtbaarheidskeuzes vast wanneer het paneel dichtstaat. */
function HiddenShowFlags({ viewer }: { viewer: ViewerInterest }) {
  if (viewer.kind !== "member") return null;
  return (
    <>
      {viewer.showName ? <input type="hidden" name="showName" value="on" /> : null}
      {viewer.showGraduationYear ? (
        <input type="hidden" name="showGraduationYear" value="on" />
      ) : null}
      {viewer.showWasInVtk ? <input type="hidden" name="showWasInVtk" value="on" /> : null}
    </>
  );
}

function GuestInterest({
  eventId,
  viewer,
  labels,
}: {
  eventId: string;
  viewer: ViewerInterest;
  labels: Labels;
}) {
  const guest = viewer.kind === "guest" ? viewer : null;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    setGuestInterestAction,
    SAVE_IDLE,
  );
  const [removeState, removeAction, removePending] = useActionState<SaveState, FormData>(
    removeGuestInterestAction,
    SAVE_IDLE,
  );
  const [removed, setRemoved] = useState(false);
  const current = removed || removeState.status === "success" ? null : guest;
  const done = state.status === "success";

  return (
    <>
      <button
        type="button"
        className={current || done ? "btn btn-ghost" : "btn btn-primary"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {current || done ? labels.joined : labels.join}
      </button>

      {labels.countLine ? <span className="vtk-interest-pill">{labels.countLine}</span> : null}

      {open ? (
        <div className="vtk-interest-expand">
          <p className="vtk-interest-intro">{labels.guestIntro}</p>

          <form action={formAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <div className="vtk-interest-fields">
              <label>
                <span>{labels.guestName}</span>
                <input
                  name="displayName"
                  maxLength={80}
                  defaultValue={current?.displayName ?? ""}
                  autoComplete="name"
                />
                <small>{labels.guestNameHint}</small>
              </label>
              <label>
                <span>{labels.guestYear}</span>
                {/* Geen `type="number"`: een spinner op een jaartal is op een
                    telefoon onbruikbaar en scrollt per ongeluk mee. */}
                <input
                  name="graduationYear"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="2004"
                  defaultValue={current?.graduationYear ?? ""}
                />
              </label>
            </div>
            <label className="vtk-interest-check">
              <input type="checkbox" name="wasInVtk" defaultChecked={current?.wasInVtk ?? false} />
              {labels.guestWasInVtk}
            </label>

            {state.status === "error" ? (
              <p className="vtk-interest-error">
                {state.code === "NOTHING_TO_SHOW" ? labels.errorNothing : labels.errorGeneric}
              </p>
            ) : null}
            {done ? <p className="vtk-interest-done">{labels.guestDone}</p> : null}

            <div className="vtk-interest-buttons">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {current || done ? labels.guestUpdate : labels.guestSubmit}
              </button>
            </div>
          </form>

          {current || done ? (
            <form action={removeAction} onSubmit={() => setRemoved(true)}>
              <input type="hidden" name="eventId" value={eventId} />
              <button type="submit" className="btn btn-ghost" disabled={removePending}>
                {labels.guestRemove}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
