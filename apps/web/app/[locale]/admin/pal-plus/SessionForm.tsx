"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePalPlusSessionAction, searchPalPlusPeopleAction } from "@/app/actions/palPlus";
import { PAL_PLUS_LIMITS, palPlusReward, parsePalPlusMoment } from "@/lib/palPlus";
import { palPlusSessionErrors } from "@/lib/palPlusMessages";

export type Person = { id: string; name: string };
export type RoomGroup = { building: string; rooms: { id: string; label: string }[] };
export type SessionCourseOption = { id: string; label: string; active: boolean };

export type SessionFormInitial = {
  id: string | null;
  courseId: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  maxParticipants: string;
  roomId: string;
  roomText: string;
  tutors: Person[];
};

/** Een aanvraag die deze sessie kan beantwoorden; aangevinkt gaat ze naar "Sessie gepland". */
export type LinkableRequest = { id: string; label: string; checked: boolean };

const ROOM_PENDING = "";
const ROOM_TEXT = "__text__";

/**
 * Een sessie plannen of aanpassen: vak, moment, tutors, lokaal en maximum.
 *
 * Onder het moment staat meteen wat elke tutor ervoor krijgt. Het uur
 * verzetten verandert de beloning, en dat moet je zien op het moment dat je het
 * doet, niet pas in de tutorlijst.
 */
export function SessionForm({
  nl,
  initial,
  courses,
  rooms,
  linkable = [],
  tutorSuggestions = [],
  onDone,
}: {
  nl: boolean;
  initial: SessionFormInitial;
  courses: SessionCourseOption[];
  rooms: RoomGroup[];
  linkable?: LinkableRequest[];
  tutorSuggestions?: Person[];
  onDone: () => void;
}) {
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const prefix = initial.id ?? "new";

  const moment = parsePalPlusMoment(date, startTime, endTime);
  const reward = moment.ok ? palPlusReward(moment.startsAt, moment.endsAt) : null;
  const rewardText =
    reward === null
      ? nl
        ? "Vul datum en uren in om de beloning te zien."
        : "Fill in the date and times to see the reward."
      : nl
        ? `Elke tutor krijgt ${reward.toLocaleString("nl-BE")} ${reward === 1 ? "bonnetje" : "bonnetjes"} (1 per gepland uur, afgerond op een half).`
        : `Each tutor gets ${reward.toLocaleString("en-GB")} ${reward === 1 ? "voucher" : "vouchers"} (1 per planned hour, rounded to a half).`;

  const visibleCourses = courses.filter((course) => course.active || course.id === initial.courseId);

  return (
    <SaveForm
      action={savePalPlusSessionAction}
      submitLabel={initial.id ? (nl ? "Opslaan" : "Save") : nl ? "Sessie plannen" : "Plan session"}
      savingLabel={nl ? "Opslaan…" : "Saving…"}
      savedMessage={
        initial.id ? (nl ? "Sessie opgeslagen." : "Session saved.") : nl ? "Sessie gepland." : "Session planned."
      }
      errorMessages={palPlusSessionErrors(nl)}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={false}
      onSuccess={onDone}
      className="vtk-palplus-sessionform"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div>
        <Label htmlFor={`pp-s-course-${prefix}`}>{nl ? "Vak" : "Course"}</Label>
        <Select id={`pp-s-course-${prefix}`} name="courseId" defaultValue={initial.courseId} required>
          <option value="" disabled>
            {nl ? "Kies een vak uit de lijst" : "Pick a course from the list"}
          </option>
          {visibleCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.label}
              {course.active ? "" : nl ? " (uit)" : " (off)"}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor={`pp-s-desc-${prefix}`}>{nl ? "Wat er aan bod komt" : "What it covers"}</Label>
        <Textarea
          id={`pp-s-desc-${prefix}`}
          name="description"
          rows={3}
          maxLength={PAL_PLUS_LIMITS.description}
          defaultValue={initial.description}
        />
        <p className="mt-1 text-xs text-vtk-muted">
          {nl ? "Staat publiek bij de sessie." : "Shown publicly with the session."}
        </p>
      </div>

      <div>
        <div className="vtk-palplus-moment">
          <div>
            <Label htmlFor={`pp-s-date-${prefix}`}>{nl ? "Datum" : "Date"}</Label>
            <Input
              id={`pp-s-date-${prefix}`}
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor={`pp-s-start-${prefix}`}>{nl ? "Van" : "From"}</Label>
            <Input
              id={`pp-s-start-${prefix}`}
              name="startTime"
              type="time"
              step={900}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor={`pp-s-end-${prefix}`}>{nl ? "Tot" : "Until"}</Label>
            <Input
              id={`pp-s-end-${prefix}`}
              name="endTime"
              type="time"
              step={900}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="vtk-palplus-reward" aria-live="polite">
          {rewardText}
        </div>
      </div>

      <RoomField nl={nl} prefix={prefix} rooms={rooms} initialRoomId={initial.roomId} initialRoomText={initial.roomText} />

      <div className="sm:max-w-56">
        <Label htmlFor={`pp-s-max-${prefix}`}>{nl ? "Maximum deelnemers" : "Maximum participants"}</Label>
        <Input
          id={`pp-s-max-${prefix}`}
          name="maxParticipants"
          type="number"
          min={1}
          max={PAL_PLUS_LIMITS.maxParticipants}
          defaultValue={initial.maxParticipants}
          placeholder={nl ? "geen maximum" : "no maximum"}
        />
      </div>

      <TutorPicker nl={nl} prefix={prefix} initial={initial.tutors} suggestions={tutorSuggestions} />

      {linkable.length > 0 && (
        <fieldset className="vtk-palplus-linkable">
          <legend>{nl ? "Deze sessie beantwoordt" : "This session answers"}</legend>
          {linkable.map((request) => (
            <label key={request.id} className="flex items-start gap-2 text-sm text-vtk-ink">
              <input type="checkbox" name="requestId" value={request.id} defaultChecked={request.checked} className="mt-1" />
              <span>{request.label}</span>
            </label>
          ))}
          <p className="text-xs text-vtk-muted">
            {nl
              ? "Aangevinkte aanvragen krijgen de status \"Sessie gepland\" en verdwijnen uit de open vragen."
              : "Ticked requests get the status \"Session planned\" and leave the open requests."}
          </p>
        </fieldset>
      )}
    </SaveForm>
  );
}

/**
 * Een lokaal uit de lijst, vrije tekst, of "lokaal volgt nog". Dat laatste is
 * een gewone toestand: Onderwijs reserveert het lokaal bij de KU Leuven, en dat
 * kan na het plannen komen.
 */
function RoomField({
  nl,
  prefix,
  rooms,
  initialRoomId,
  initialRoomText,
}: {
  nl: boolean;
  prefix: string;
  rooms: RoomGroup[];
  initialRoomId: string;
  initialRoomText: string;
}) {
  const [choice, setChoice] = useState(initialRoomId || (initialRoomText ? ROOM_TEXT : ROOM_PENDING));

  return (
    <div>
      <Label htmlFor={`pp-s-room-${prefix}`}>{nl ? "Lokaal" : "Room"}</Label>
      <Select id={`pp-s-room-${prefix}`} value={choice} onChange={(event) => setChoice(event.target.value)}>
        <option value={ROOM_PENDING}>{nl ? "Lokaal volgt nog" : "Room to follow"}</option>
        <option value={ROOM_TEXT}>{nl ? "Ander lokaal (vrije tekst)" : "Other room (free text)"}</option>
        {rooms.map((group) => (
          <optgroup key={group.building} label={group.building}>
            {group.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <input type="hidden" name="roomId" value={choice === ROOM_TEXT || choice === ROOM_PENDING ? "" : choice} />
      {choice === ROOM_TEXT && (
        <Input
          className="mt-2"
          name="roomText"
          defaultValue={initialRoomText}
          maxLength={PAL_PLUS_LIMITS.roomText}
          placeholder={nl ? "Bib, studiezaal 2" : "Library, study room 2"}
          aria-label={nl ? "Lokaal in vrije tekst" : "Room as free text"}
          required
        />
      )}
      <p className="mt-1 text-xs text-vtk-muted">
        {nl
          ? "Reserveer het lokaal via de KU Leuven en zet het hier. Een lokaal uit de lijst geeft de kaart en de wegbeschrijving erbij."
          : "Book the room through KU Leuven and set it here. A room from the list comes with the map and directions."}
      </p>
    </div>
  );
}

/** Tutors kiezen: zoeken op naam, e-mail of r-nummer, of een voorstel aanklikken. */
function TutorPicker({
  nl,
  prefix,
  initial,
  suggestions,
}: {
  nl: boolean;
  prefix: string;
  initial: Person[];
  suggestions: Person[];
}) {
  const [tutors, setTutors] = useState<Person[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Geen zoekopdracht meer laten lopen nadat het formulier dicht is.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Zoeken na een korte pauze in het typen, niet bij elke toets. */
  function onQueryChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const needle = value.trim();
    const ticket = ++latest.current;
    if (needle.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const found = await searchPalPlusPeopleAction(needle);
      // Een trager antwoord op een oudere zoekterm mag een nieuwer niet overschrijven.
      if (ticket !== latest.current) return;
      setResults(found.map(({ id, name }) => ({ id, name })));
      setSearching(false);
    }, 250);
  }

  const add = (person: Person) => {
    setTutors((prev) => (prev.some((tutor) => tutor.id === person.id) ? prev : [...prev, person]));
    if (timer.current) clearTimeout(timer.current);
    latest.current++;
    setQuery("");
    setResults([]);
    setSearching(false);
  };
  const remove = (id: string) => setTutors((prev) => prev.filter((tutor) => tutor.id !== id));
  const openSuggestions = suggestions.filter((person) => !tutors.some((tutor) => tutor.id === person.id));
  const full = tutors.length >= PAL_PLUS_LIMITS.tutors;

  return (
    <div>
      <Label htmlFor={`pp-s-tutor-${prefix}`}>{nl ? "Tutors" : "Tutors"}</Label>
      {tutors.map((tutor) => (
        <input key={tutor.id} type="hidden" name="tutorId" value={tutor.id} />
      ))}
      {tutors.length > 0 ? (
        <ul className="vtk-palplus-chips">
          {tutors.map((tutor) => (
            <li key={tutor.id}>
              {tutor.name}
              <button
                type="button"
                onClick={() => remove(tutor.id)}
                aria-label={`${nl ? "Weghalen" : "Remove"}: ${tutor.name}`}
                title={nl ? "Weghalen" : "Remove"}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-vtk-muted">
          {nl ? "Nog geen tutor. Een sessie heeft er minstens één." : "No tutor yet. A session needs at least one."}
        </p>
      )}

      {openSuggestions.length > 0 && !full && (
        <div className="vtk-palplus-suggest">
          <span className="text-xs text-vtk-muted">{nl ? "Boden aan:" : "Offered:"}</span>
          {openSuggestions.map((person) => (
            <button key={person.id} type="button" onClick={() => add(person)}>
              + {person.name}
            </button>
          ))}
        </div>
      )}

      {!full && (
        <div className="relative">
          <Input
            id={`pp-s-tutor-${prefix}`}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              // Enter in het zoekveld kiest de eerste treffer in plaats van het
              // hele sessieformulier te versturen.
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (results[0]) add(results[0]);
            }}
            placeholder={nl ? "Zoek op naam, e-mail of r-nummer" : "Search by name, email or r-number"}
            autoComplete="off"
          />
          {(results.length > 0 || searching) && (
            <ul className="vtk-palplus-results" role="listbox">
              {searching && results.length === 0 && (
                <li className="text-vtk-muted">{nl ? "Zoeken…" : "Searching…"}</li>
              )}
              {results.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => add(person)}>
                    {person.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
