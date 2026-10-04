"use client";

import { useState } from "react";
import { Button, Card, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { Modal } from "../admin-table";
import { cancelPalPlusSessionAction } from "@/app/actions/palPlus";
import { PAL_PLUS_LIMITS, type PalPlusSessionState } from "@/lib/palPlus";
import { palPlusMemberErrors, palPlusSessionErrors } from "@/lib/palPlusMessages";
import { AttendanceList, type AttendanceEntry } from "@/components/palPlus/AttendanceList";
import {
  SessionForm,
  type Person,
  type RoomGroup,
  type SessionCourseOption,
  type SessionFormInitial,
} from "./SessionForm";

export type PalPlusSessionView = {
  id: string;
  courseLabel: string;
  description: string;
  whenLabel: string;
  state: PalPlusSessionState;
  roomLabel: string | null;
  tutors: (Person & { rewardLabel: string })[];
  attendees: AttendanceEntry[];
  attendeeCount: number;
  maxParticipants: number | null;
  cancelReason: string | null;
  requestLabels: string[];
  form: SessionFormInitial;
};

const EMPTY_SESSION: SessionFormInitial = {
  id: null,
  courseId: "",
  description: "",
  date: "",
  startTime: "",
  endTime: "",
  maxParticipants: "",
  roomId: "",
  roomText: "",
  tutors: [],
};

/**
 * Alle sessies: wat komt bovenaan, wat voorbij is eronder. Een sessie zonder
 * lokaal valt op, want dat is het werk dat nog te doen is.
 */
export function SessionsBoard({
  nl,
  upcoming,
  past,
  courses,
  rooms,
}: {
  nl: boolean;
  upcoming: PalPlusSessionView[];
  past: PalPlusSessionView[];
  courses: SessionCourseOption[];
  rooms: RoomGroup[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = [...upcoming, ...past].find((session) => session.id === selectedId) ?? null;
  const pendingRooms = upcoming.filter((session) => session.state !== "cancelled" && !session.roomLabel).length;

  return (
    <>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{nl ? "Komende sessies" : "Upcoming sessions"}</h2>
            {pendingRooms > 0 && (
              <p className="text-sm text-vtk-muted">
                {nl
                  ? `${pendingRooms} ${pendingRooms === 1 ? "sessie wacht" : "sessies wachten"} nog op een lokaal.`
                  : `${pendingRooms} ${pendingRooms === 1 ? "session is" : "sessions are"} still waiting for a room.`}
              </p>
            )}
          </div>
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            {nl ? "Nieuwe sessie" : "New session"}
          </Button>
        </div>
        <SessionTable nl={nl} sessions={upcoming} onOpen={setSelectedId} empty={nl ? "Geen komende sessies." : "No upcoming sessions."} />
      </Card>

      {past.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold">{nl ? "Voorbij" : "Past"}</h2>
          <SessionTable nl={nl} sessions={past} onOpen={setSelectedId} empty="" />
        </Card>
      )}

      {creating && (
        <Modal title={nl ? "Nieuwe sessie" : "New session"} size="lg" onClose={() => setCreating(false)}>
          <SessionForm nl={nl} initial={EMPTY_SESSION} courses={courses} rooms={rooms} onDone={() => setCreating(false)} />
        </Modal>
      )}

      {selected && (
        <Modal title={`${selected.courseLabel}: ${selected.whenLabel}`} size="lg" onClose={() => setSelectedId(null)}>
          <SessionDetail nl={nl} session={selected} courses={courses} rooms={rooms} onDone={() => setSelectedId(null)} />
        </Modal>
      )}
    </>
  );
}

function SessionTable({
  nl,
  sessions,
  onOpen,
  empty,
}: {
  nl: boolean;
  sessions: PalPlusSessionView[];
  onOpen: (id: string) => void;
  empty: string;
}) {
  if (sessions.length === 0) return <p className="text-sm text-vtk-muted">{empty}</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="vtk-palplus-table">
        <thead>
          <tr>
            <th scope="col">{nl ? "Vak" : "Course"}</th>
            <th scope="col">{nl ? "Wanneer" : "When"}</th>
            <th scope="col">{nl ? "Lokaal" : "Room"}</th>
            <th scope="col">{nl ? "Tutors" : "Tutors"}</th>
            <th scope="col" className="is-num">
              {nl ? "Ingeschreven" : "Signed up"}
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.id}
              className="vtk-palplus-row"
              data-inactive={session.state === "cancelled" ? "true" : undefined}
              onClick={() => onOpen(session.id)}
            >
              <th scope="row">
                <button
                  type="button"
                  className="vtk-palplus-rowtitle"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(session.id);
                  }}
                >
                  {session.courseLabel}
                </button>
                {session.state === "cancelled" && (
                  <span className="vtk-palplus-off">{nl ? "Geannuleerd" : "Cancelled"}</span>
                )}
              </th>
              <td data-label={nl ? "Wanneer" : "When"}>{session.whenLabel}</td>
              <td data-label={nl ? "Lokaal" : "Room"}>
                {session.roomLabel ??
                  (session.state === "upcoming" || session.state === "running" ? (
                    <span className="vtk-palplus-pending">{nl ? "Lokaal volgt" : "Room to follow"}</span>
                  ) : (
                    <span className="text-vtk-muted">{nl ? "geen" : "none"}</span>
                  ))}
              </td>
              <td data-label={nl ? "Tutors" : "Tutors"}>{session.tutors.map((tutor) => tutor.name).join(", ")}</td>
              <td data-label={nl ? "Ingeschreven" : "Signed up"} className="is-num">
                {session.maxParticipants !== null
                  ? `${session.attendeeCount} / ${session.maxParticipants}`
                  : session.attendeeCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionDetail({
  nl,
  session,
  courses,
  rooms,
  onDone,
}: {
  nl: boolean;
  session: PalPlusSessionView;
  courses: SessionCourseOption[];
  rooms: RoomGroup[];
  onDone: () => void;
}) {
  const cancelled = session.state === "cancelled";
  const started = session.state === "running" || session.state === "past";

  return (
    <div className="vtk-palplus-detail">
      {cancelled ? (
        <section>
          <span className="vtk-palplus-status" data-status="CLOSED">
            {nl ? "Geannuleerd" : "Cancelled"}
          </span>
          {session.cancelReason && <div className="vtk-palplus-text">{session.cancelReason}</div>}
          <dl className="vtk-palplus-facts mt-3">
            <div>
              <dt>{nl ? "Lokaal" : "Room"}</dt>
              <dd>{session.roomLabel ?? (nl ? "geen" : "none")}</dd>
            </div>
            <div>
              <dt>{nl ? "Tutors" : "Tutors"}</dt>
              <dd>{session.tutors.map((tutor) => tutor.name).join(", ")}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <SessionForm nl={nl} initial={session.form} courses={courses} rooms={rooms} onDone={onDone} />
      )}

      {!cancelled && session.tutors.length > 0 && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Beloning" : "Reward"}</h3>
          <ul className="vtk-palplus-names">
            {session.tutors.map((tutor) => (
              <li key={tutor.id}>
                {tutor.name} <span className="text-vtk-muted">({tutor.rewardLabel})</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-vtk-muted">
            {started
              ? nl
                ? "Verdiend zodra de sessie voorbij is. Ging ze niet door, annuleer ze dan hieronder."
                : "Earned once the session is over. If it did not happen, cancel it below."
              : nl
                ? "Verdiend zodra de sessie voorbij is."
                : "Earned once the session is over."}
          </p>
        </section>
      )}

      {session.requestLabels.length > 0 && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Beantwoordt" : "Answers"}</h3>
          <ul className="vtk-palplus-names">
            {session.requestLabels.map((label, index) => (
              <li key={`${label}-${index}`}>{label}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="vtk-palplus-action">
        <h3>
          {nl ? "Ingeschreven" : "Signed up"} ({session.attendeeCount}
          {session.maxParticipants !== null ? ` / ${session.maxParticipants}` : ""})
        </h3>
        {session.attendees.length === 0 ? (
          <p className="text-sm text-vtk-muted">{nl ? "Nog niemand." : "Nobody yet."}</p>
        ) : started && !cancelled ? (
          <AttendanceList
            sessionId={session.id}
            attendees={session.attendees}
            copy={{
              came: nl ? "Kwam" : "Came",
              didNotCome: nl ? "Kwam niet" : "Did not come",
              summary: nl ? "{came} van {total} kwamen." : "{came} of {total} came.",
              notMarked: nl ? "{count} nog niet aangeduid." : "{count} not marked yet.",
              errors: palPlusMemberErrors(nl),
              fallbackError: nl ? "Niet opgeslagen." : "Not saved.",
            }}
          />
        ) : (
          <ul className="vtk-palplus-names vtk-palplus-names-cols">
            {session.attendees.map((attendee) => (
              <li key={attendee.userId}>{attendee.name}</li>
            ))}
          </ul>
        )}
      </section>

      {!cancelled && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Sessie annuleren" : "Cancel session"}</h3>
          <SaveForm
            action={cancelPalPlusSessionAction}
            submitLabel={nl ? "Annuleren" : "Cancel session"}
            savingLabel={nl ? "Annuleren…" : "Cancelling…"}
            savedMessage={nl ? "Sessie geannuleerd." : "Session cancelled."}
            errorMessages={palPlusSessionErrors(nl)}
            fallbackErrorMessage={nl ? "Niet geannuleerd." : "Not cancelled."}
            submitVariant="ghost"
            submitSize="sm"
            onSuccess={onDone}
            confirmSubmit={{
              title: nl ? "Sessie annuleren?" : "Cancel session?",
              description: started
                ? nl
                  ? `Deze sessie telt dan niet mee en de tutors krijgen er geen bonnetjes voor. De hulpvragen die ze beantwoordde, staan weer open. Dit kan je niet ongedaan maken.`
                  : `The session then does not count and the tutors get no vouchers for it. The help requests it answered are open again. This cannot be undone.`
                : `${
                    session.attendeeCount === 0
                      ? nl
                        ? "Er is nog niemand ingeschreven."
                        : "Nobody has signed up yet."
                      : nl
                        ? `${session.attendeeCount === 1 ? "Wie ingeschreven is, ziet" : `De ${session.attendeeCount} ingeschrevenen zien`} dat de sessie niet doorgaat, met jouw reden.`
                        : `${session.attendeeCount === 1 ? "The person" : `The ${session.attendeeCount} people`} signed up see that the session is not going ahead, with your reason.`
                  } ${
                    nl
                      ? "De hulpvragen die ze beantwoordde, staan weer open. Dit kan je niet ongedaan maken; een nieuwe sessie plannen kan altijd."
                      : "The help requests it answered are open again. This cannot be undone; you can always plan a new session."
                  }`,
              confirmLabel: nl ? "Sessie annuleren" : "Cancel session",
              cancelLabel: nl ? "Terug" : "Back",
            }}
            className="space-y-3"
          >
            <input type="hidden" name="id" value={session.id} />
            <div>
              <Label htmlFor={`pp-cancel-${session.id}`}>{nl ? "Reden" : "Reason"}</Label>
              <Textarea
                id={`pp-cancel-${session.id}`}
                name="reason"
                rows={2}
                maxLength={PAL_PLUS_LIMITS.cancelReason}
                placeholder={
                  started
                    ? nl
                      ? "De tutor was ziek; de sessie ging niet door."
                      : "The tutor was ill; the session did not happen."
                    : nl
                      ? "De tutor is ziek. We plannen een nieuwe datum."
                      : "The tutor is ill. We will plan a new date."
                }
                required
              />
            </div>
          </SaveForm>
        </section>
      )}
    </div>
  );
}
