"use client";

import { useState, type CSSProperties } from "react";
import { Button, Card, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { Modal } from "../admin-table";
import { cancelPalPlusSessionAction } from "@/app/actions/palPlus";
import { PAL_PLUS_LIMITS, type PalPlusSessionState } from "@/lib/palPlus";
import { palPlusMemberErrors, palPlusSessionErrors } from "@/lib/palPlusMessages";
import { AttendanceList, type AttendanceEntry } from "@/components/palPlus/AttendanceList";
import { RentalMonthGrid } from "@/components/theokot/RentalMonthGrid";
import {
  SessionForm,
  type Person,
  type RoomGroup,
  type SessionCourseOption,
  type SessionFormInitial,
  type TagSuggestions,
} from "./SessionForm";

export type PalPlusSessionView = {
  id: string;
  courseLabel: string;
  description: string;
  tags: string[];
  /** De dag in Brussel ("YYYY-MM-DD"), voor de agenda. */
  dayKey: string;
  /** Het beginuur ("14:00"), voor de agenda. */
  timeLabel: string;
  whenLabel: string;
  state: PalPlusSessionState;
  roomLabel: string | null;
  tutors: (Person & { rewardLabel: string })[];
  /** Wat de tutors samen al uitgaven van de bonnetjes van deze sessie. */
  spentVouchers: number;
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
  tags: [],
  date: "",
  startTime: "",
  endTime: "",
  maxParticipants: "",
  roomId: "",
  roomText: "",
  tutors: [],
};

/**
 * Alle sessies, als maandagenda of als lijst. Een sessie zonder lokaal valt op,
 * want dat is het werk dat nog te doen is.
 *
 * De agenda is het maandraster van de Theokot-verhuur (`RentalMonthGrid`): het
 * raster is overal hetzelfde, de inhoud van een dag bepaalt deze component. De
 * lijst blijft, voor wie de sessies onder elkaar wil zien.
 */
export function SessionsBoard({
  nl,
  todayKey,
  upcoming,
  past,
  courses,
  rooms,
  tags,
}: {
  nl: boolean;
  todayKey: string;
  upcoming: PalPlusSessionView[];
  past: PalPlusSessionView[];
  courses: SessionCourseOption[];
  rooms: RoomGroup[];
  tags: TagSuggestions;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"agenda" | "list">("agenda");
  const all = [...past, ...upcoming];
  const selected = all.find((session) => session.id === selectedId) ?? null;
  const pendingRooms = upcoming.filter((session) => session.state !== "cancelled" && !session.roomLabel).length;

  return (
    <>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{nl ? "Sessies" : "Sessions"}</h2>
            {pendingRooms > 0 && (
              <p className="text-sm text-vtk-muted">
                {nl
                  ? `${pendingRooms} ${pendingRooms === 1 ? "sessie wacht" : "sessies wachten"} nog op een lokaal.`
                  : `${pendingRooms} ${pendingRooms === 1 ? "session is" : "sessions are"} still waiting for a room.`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="tv-segment" role="group" aria-label={nl ? "Weergave" : "View"}>
              <button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")}>
                {nl ? "Agenda" : "Calendar"}
              </button>
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
                {nl ? "Lijst" : "List"}
              </button>
            </div>
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              {nl ? "Nieuwe sessie" : "New session"}
            </Button>
          </div>
        </div>
        {view === "agenda" ? (
          <SessionAgenda nl={nl} todayKey={todayKey} sessions={all} onOpen={setSelectedId} />
        ) : (
          <>
            <h3 className="mb-3 text-sm font-semibold text-vtk-muted">{nl ? "Komend" : "Upcoming"}</h3>
            <SessionTable
              nl={nl}
              sessions={upcoming}
              onOpen={setSelectedId}
              empty={nl ? "Geen komende sessies." : "No upcoming sessions."}
            />
            {past.length > 0 && (
              <>
                <h3 className="mb-3 mt-6 text-sm font-semibold text-vtk-muted">{nl ? "Voorbij" : "Past"}</h3>
                <SessionTable nl={nl} sessions={past} onOpen={setSelectedId} empty="" />
              </>
            )}
          </>
        )}
      </Card>

      {creating && (
        <Modal title={nl ? "Nieuwe sessie" : "New session"} size="lg" onClose={() => setCreating(false)}>
          <SessionForm
            nl={nl}
            initial={EMPTY_SESSION}
            courses={courses}
            rooms={rooms}
            tags={tags}
            onDone={() => setCreating(false)}
          />
        </Modal>
      )}

      {selected && (
        <Modal title={`${selected.courseLabel}: ${selected.whenLabel}`} size="lg" onClose={() => setSelectedId(null)}>
          <SessionDetail
            nl={nl}
            session={selected}
            courses={courses}
            rooms={rooms}
            tags={tags}
            onDone={() => setSelectedId(null)}
          />
        </Modal>
      )}
    </>
  );
}

/**
 * De maandagenda. Een sessie is een blokje met het uur en het vak; zonder lokaal
 * heeft het een streepjesrand, geannuleerd is het doorstreept, voorbij is het
 * grijs. Op een telefoon worden de blokjes stippen en toont een tik op een dag
 * de sessies eronder, zoals in de verhuurkalender.
 */
function SessionAgenda({
  nl,
  todayKey,
  sessions,
  onOpen,
}: {
  nl: boolean;
  todayKey: string;
  sessions: PalPlusSessionView[];
  onOpen: (id: string) => void;
}) {
  const [year, month] = todayKey.split("-").map(Number);
  const [cursor, setCursor] = useState(() => new Date(year!, month! - 1, 1));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(todayKey);
  const byDay = new Map<string, PalPlusSessionView[]>();
  for (const session of [...sessions].sort((a, b) => (a.dayKey + a.timeLabel).localeCompare(b.dayKey + b.timeLabel))) {
    byDay.set(session.dayKey, [...(byDay.get(session.dayKey) ?? []), session]);
  }
  const monthFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { month: "long", year: "numeric" });
  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  const step = (delta: number) => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  const chip = (session: PalPlusSessionView) => (
    <button
      key={session.id}
      type="button"
      className="tv-chip"
      data-status={session.state === "cancelled" ? "CANCELLED" : undefined}
      data-room={!session.roomLabel && (session.state === "upcoming" || session.state === "running") ? "pending" : undefined}
      style={session.state === "past" ? ({ "--tone": "#5C667F" } as CSSProperties) : undefined}
      onClick={() => onOpen(session.id)}
      title={`${session.timeLabel} ${session.courseLabel}${session.roomLabel ? `, ${session.roomLabel}` : ""}`}
    >
      <span>
        <strong>{session.timeLabel}</strong>
        {session.courseLabel}
      </span>
    </button>
  );

  return (
    <div>
      <div className="tv-toolbar">
        <button type="button" className="tv-step" onClick={() => step(-1)} aria-label={nl ? "Vorige maand" : "Previous month"}>
          ‹
        </button>
        <button type="button" className="tv-step" onClick={() => step(1)} aria-label={nl ? "Volgende maand" : "Next month"}>
          ›
        </button>
        <span className="tv-toolbar-title">{monthFmt.format(cursor)}</span>
        <button
          type="button"
          className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60"
          onClick={() => {
            setCursor(new Date(year!, month! - 1, 1));
            setSelectedDayKey(todayKey);
          }}
        >
          {nl ? "Vandaag" : "Today"}
        </button>
      </div>
      <p className="tv-legend">
        <span>
          <i style={{ background: "var(--navy)" }} />
          {nl ? "Gepland, met lokaal" : "Planned, with a room"}
        </span>
        <span>
          <i style={{ background: "transparent", border: "1px dashed var(--navy)" }} />
          {nl ? "Lokaal volgt" : "Room to follow"}
        </span>
        <span>
          <i style={{ background: "#5C667F", opacity: 0.5 }} />
          {nl ? "Voorbij of geannuleerd" : "Past or cancelled"}
        </span>
      </p>
      <RentalMonthGrid
        nl={nl}
        cursor={cursor}
        todayKey={todayKey}
        selectedKey={selectedDayKey}
        onSelectDate={setSelectedDayKey}
        cellAriaLabel={(cell) => {
          const count = (byDay.get(cell.key) ?? []).length;
          return `${dayFmt.format(cell.date)}, ${count} ${count === 1 ? (nl ? "sessie" : "session") : nl ? "sessies" : "sessions"}`;
        }}
        renderCell={(cell) => {
          const onDay = byDay.get(cell.key) ?? [];
          return (
            <>
              <div className="tv-month-chips">{onDay.map(chip)}</div>
              {onDay.length > 0 && (
                <span className="tv-dots" aria-hidden="true">
                  {onDay.slice(0, 3).map((session) => (
                    <i
                      key={session.id}
                      className="tv-dot"
                      style={{ background: session.state === "upcoming" || session.state === "running" ? "var(--navy)" : "#5C667F" }}
                    />
                  ))}
                </span>
              )}
            </>
          );
        }}
      />
      {selectedDayKey && (
        <div className="tv-admin-day-detail">
          <h4>
            {(() => {
              const [y, m, d] = selectedDayKey.split("-").map(Number);
              const text = dayFmt.format(new Date(y!, m! - 1, d!));
              return text.charAt(0).toUpperCase() + text.slice(1);
            })()}
          </h4>
          {(byDay.get(selectedDayKey) ?? []).length === 0 ? (
            <p className="tv-avail-note">{nl ? "Geen sessies op deze dag." : "No sessions on this day."}</p>
          ) : (
            <div className="tv-admin-day-chips">{(byDay.get(selectedDayKey) ?? []).map(chip)}</div>
          )}
        </div>
      )}
    </div>
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
  tags,
  onDone,
}: {
  nl: boolean;
  session: PalPlusSessionView;
  courses: SessionCourseOption[];
  rooms: RoomGroup[];
  tags: TagSuggestions;
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
        <SessionForm nl={nl} initial={session.form} courses={courses} rooms={rooms} tags={tags} onDone={onDone} />
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
                  ? `Deze sessie telt dan niet mee en de tutors krijgen er geen bonnetjes voor.${
                      session.spentVouchers > 0
                        ? ` Er ${session.spentVouchers === 1 ? "werd al 1 bonnetje" : `werden al ${session.spentVouchers.toLocaleString("nl-BE")} bonnetjes`} van uitgegeven: dat komt uit de andere openstaande bonnetjes van de tutor, en wat daar niet in past, vervalt.`
                        : ""
                    } De hulpvragen die ze beantwoordde, staan weer open. Dit kan je niet ongedaan maken.`
                  : `The session then does not count and the tutors get no vouchers for it.${
                      session.spentVouchers > 0
                        ? ` ${session.spentVouchers === 1 ? "1 voucher was" : `${session.spentVouchers.toLocaleString("en-GB")} vouchers were`} already spent: that comes out of the tutor's other outstanding vouchers, and whatever does not fit is written off.`
                        : ""
                    } The help requests it answered are open again. This cannot be undone.`
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
            <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
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
