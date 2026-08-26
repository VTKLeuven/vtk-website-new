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
 * Drie gedaanten, en het verschil zit niet in de knop maar in wie je bent:
 *
 * - **Ingelogd**: één knop, aan of uit. Bij een alumni-evenement staan er drie
 *   vakjes bij waarmee je kiest wat er in de aanwezigheidslijst mag staan; alles
 *   staat standaard uit, dus wie niets aanvinkt telt enkel mee in het getal.
 * - **Niet ingelogd, alumni-evenement**: een kort formulier. De naam is
 *   optioneel; het afstudeerjaar of "ik zat in VTK" volstaat. Zonder één van de
 *   drie is er niets te tonen en weigert de server.
 * - **Niet ingelogd, gewoon evenement**: een verwijzing naar het inlogscherm.
 *   Daar telt één account één keer, en dat is wat de teller bruikbaar houdt.
 */

type Labels = {
  heading: string;
  countLine: string | null;
  join: string;
  joined: string;
  leave: string;
  loginPrompt: string;
  loginCta: string;
  showHeading: string;
  showHint: string;
  showName: string;
  showGraduationYear: string;
  showWasInVtk: string;
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

export function EventInterestPanel({
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
  return (
    <section className="vtk-interest">
      <div className="vtk-interest-head">
        <h2>{labels.heading}</h2>
        {labels.countLine ? <span className="vtk-interest-count">{labels.countLine}</span> : null}
      </div>

      {signedIn ? (
        <MemberForm
          eventId={eventId}
          isAlumniEvent={isAlumniEvent}
          viewer={viewer}
          accountHref={accountHref}
          labels={labels}
        />
      ) : isAlumniEvent ? (
        <GuestForm eventId={eventId} viewer={viewer} labels={labels} />
      ) : (
        <p className="vtk-interest-login">
          {labels.loginPrompt}{" "}
          <Link href={loginHref} className="vtk-link">
            {labels.loginCta}
          </Link>
        </p>
      )}
    </section>
  );
}

function MemberForm({
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
  const joined = viewer.kind === "member";
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    setEventInterestAction,
    SAVE_IDLE,
  );

  return (
    <form action={formAction} className="vtk-interest-form">
      <input type="hidden" name="eventId" value={eventId} />

      {/* De vakjes horen bij het aanduiden zelf, dus ze staan boven de knop en
          worden bij dezelfde submit meegestuurd. */}
      {isAlumniEvent && (
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
      )}

      <div className="vtk-interest-buttons">
        <button
          type="submit"
          name="interested"
          value="on"
          className={joined ? "btn btn-ghost" : "btn btn-primary"}
          disabled={pending}
        >
          {joined ? labels.joined : labels.join}
        </button>
        {joined && (
          <button
            type="submit"
            name="interested"
            value="off"
            className="btn btn-ghost"
            disabled={pending}
          >
            {labels.leave}
          </button>
        )}
      </div>

      {state.status === "error" && (
        <p className="vtk-interest-error">{labels.errorGeneric}</p>
      )}
    </form>
  );
}

function GuestForm({
  eventId,
  viewer,
  labels,
}: {
  eventId: string;
  viewer: ViewerInterest;
  labels: Labels;
}) {
  const guest = viewer.kind === "guest" ? viewer : null;
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    setGuestInterestAction,
    SAVE_IDLE,
  );
  const [removeState, removeAction, removePending] = useActionState<SaveState, FormData>(
    removeGuestInterestAction,
    SAVE_IDLE,
  );
  // Na een geslaagde verwijdering is de server-render nog niet terug; toon
  // meteen het lege formulier in plaats van de oude waarden.
  const [removed, setRemoved] = useState(false);
  const current = removed || removeState.status === "success" ? null : guest;

  return (
    <div className="vtk-interest-guest">
      <p className="vtk-interest-intro">{labels.guestIntro}</p>

      <form action={formAction} className="vtk-interest-form">
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

        {state.status === "error" && (
          <p className="vtk-interest-error">
            {state.code === "NOTHING_TO_SHOW" ? labels.errorNothing : labels.errorGeneric}
          </p>
        )}
        {state.status === "success" && <p className="vtk-interest-done">{labels.guestDone}</p>}

        <div className="vtk-interest-buttons">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {current ? labels.guestUpdate : labels.guestSubmit}
          </button>
        </div>
      </form>

      {current && (
        <form action={removeAction} onSubmit={() => setRemoved(true)}>
          <input type="hidden" name="eventId" value={eventId} />
          <button type="submit" className="btn btn-ghost" disabled={removePending}>
            {labels.guestRemove}
          </button>
        </form>
      )}
    </div>
  );
}
