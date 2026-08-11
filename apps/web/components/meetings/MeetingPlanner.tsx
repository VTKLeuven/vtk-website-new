"use client";

import { useState } from "react";
import type { MeetingKind } from "@prisma/client";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import {
  MEETING_DEFAULTS,
  monthDays,
  semesterMonths,
  suggestedMeetingDays,
  type Semester,
  type WeekParity,
} from "@/lib/meetings";
import { planMeetingsAction } from "@/app/actions/meetings";

/** Eén dag die al een moment heeft; met reservaties kan ze niet weg. */
export type PlannedDay = {
  day: string;
  reservations: number;
  /** "HH:mm" van het bestaande moment. */
  time: string;
  location: string;
};

/** Uur en plaats van één aangeduide dag; per keer verschillend. */
type DayPlan = { time: string; location: string };

const WEEKDAYS_NL = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * De kalender waarmee het beheer in één beweging een heel semester inplant: duid
 * de dagen aan waarop er een grocomeet of bureau is, en zet er per dag het uur en
 * de plaats bij.
 *
 * Uur en plaats staan per dag en niet één keer bovenaan: een vergadering
 * verhuist geregeld naar een ander lokaal of een ander uur, en dan hoort de
 * kalender dat te kunnen zeggen in plaats van je twintig keer naar het
 * detailscherm te sturen. Het veld bovenaan is enkel het startpunt voor de
 * volgende dag die je aanduidt.
 */
export function MeetingPlanner({
  nl,
  kind,
  year,
  semester,
  planned,
  defaultTime,
  defaultOpensDaysBefore,
}: {
  nl: boolean;
  kind: MeetingKind;
  year: number;
  semester: Semester;
  planned: PlannedDay[];
  defaultTime?: string;
  defaultOpensDaysBefore?: number;
}) {
  const plannedByDay = new Map(planned.map((entry) => [entry.day, entry]));
  const [parity, setParity] = useState<WeekParity>(MEETING_DEFAULTS[kind].parity);
  const [newDayTime, setNewDayTime] = useState(defaultTime ?? MEETING_DEFAULTS[kind].time);
  const [newDayLocation, setNewDayLocation] = useState("");

  const [days, setDays] = useState<Map<string, DayPlan>>(() => {
    if (planned.length > 0) {
      return new Map(planned.map((entry) => [entry.day, { time: entry.time, location: entry.location }]));
    }
    const time = defaultTime ?? MEETING_DEFAULTS[kind].time;
    return new Map(
      suggestedMeetingDays(year, semester, kind).map((day) => [day, { time, location: "" }]),
    );
  });

  function toggle(day: string) {
    setDays((current) => {
      const next = new Map(current);
      if (next.has(day)) {
        // Een dag met reservaties kan hier niet weg: die verwijder je bewust bij
        // het moment zelf, waar de bevestiging zegt wat er verdwijnt.
        if ((plannedByDay.get(day)?.reservations ?? 0) > 0) return current;
        next.delete(day);
      } else {
        const existing = plannedByDay.get(day);
        next.set(day, {
          time: existing?.time ?? newDayTime,
          location: existing?.location ?? newDayLocation,
        });
      }
      return next;
    });
  }

  /**
   * Zet de selectie op het voorstel voor deze weken. Dagen waarvoor al besteld
   * is, blijven staan: die kan de kalender niet schrappen.
   */
  function applySuggestion(next: WeekParity) {
    setParity(next);
    setDays((current) => {
      const result = new Map<string, DayPlan>();
      for (const [day, plan] of current) {
        if ((plannedByDay.get(day)?.reservations ?? 0) > 0) result.set(day, plan);
      }
      for (const day of suggestedMeetingDays(year, semester, kind, next)) {
        if (result.has(day)) continue;
        const existing = plannedByDay.get(day);
        result.set(day, {
          time: existing?.time ?? newDayTime,
          location: existing?.location ?? newDayLocation,
        });
      }
      return result;
    });
  }

  function updateDay(day: string, patch: Partial<DayPlan>) {
    setDays((current) => {
      const plan = current.get(day);
      if (!plan) return current;
      const next = new Map(current);
      next.set(day, { ...plan, ...patch });
      return next;
    });
  }

  const weekdays = nl ? WEEKDAYS_NL : WEEKDAYS_EN;
  const months = semesterMonths(year, semester);
  const monthLabel = (m: { year: number; month: number }) =>
    new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { month: "long", year: "numeric" }).format(
      new Date(Date.UTC(m.year, m.month - 1, 1, 12)),
    );
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${day}T12:00:00Z`));

  const selectedDays = [...days.keys()].sort();

  const parityOptions: Array<{ value: WeekParity; label: string }> = [
    { value: "all", label: nl ? "Elke week" : "Every week" },
    { value: "even", label: nl ? "Even weken" : "Even weeks" },
    { value: "odd", label: nl ? "Oneven weken" : "Odd weeks" },
  ];

  return (
    <SaveForm
      action={planMeetingsAction}
      className="space-y-4"
      resetOnSuccess={false}
      submitLabel={nl ? "Kalender opslaan" : "Save calendar"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "De kalender is opgeslagen" : "The calendar has been saved"}
      errorMessages={
        nl
          ? {
              INVALID_TIME: "Geef bij elke dag een geldig uur op (bv. 12:45).",
              KEPT_WITH_RESERVATIONS:
                "Opgeslagen. Dagen waarvoor al besteld is, bleven staan; verwijder die apart bij het moment zelf.",
            }
          : {
              INVALID_TIME: "Enter a valid time for every day (e.g. 12:45).",
              KEPT_WITH_RESERVATIONS:
                "Saved. Days with existing orders were kept; remove those separately at the meeting itself.",
            }
      }
      fallbackErrorMessage={nl ? "Opslaan van de kalender mislukt." : "Saving the calendar failed."}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="semester" value={semester} />
      <input type="hidden" name="dayCount" value={selectedDays.length} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
          {nl ? "Voorstel" : "Suggestion"}
        </span>
        {parityOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => applySuggestion(option.value)}
            aria-pressed={parity === option.value}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              parity === option.value
                ? "border-vtk-ink bg-vtk-ink text-white"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((month) => (
          <div key={`${month.year}-${month.month}`} className="rounded-xl border border-vtk-blue/10 p-3">
            <div className="mb-2 text-sm font-semibold capitalize text-vtk-ink">{monthLabel(month)}</div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5c667f]">
              {weekdays.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthDays(month.year, month.month).map((day, index) => (
                <DayCell
                  key={day.value}
                  nl={nl}
                  day={day}
                  first={index === 0}
                  selected={days.has(day.value)}
                  locked={(plannedByDay.get(day.value)?.reservations ?? 0) > 0}
                  onToggle={() => toggle(day.value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>{nl ? "Uur voor een nieuwe dag" : "Time for a new day"}</Label>
          <Input type="time" value={newDayTime} onChange={(event) => setNewDayTime(event.target.value)} />
        </div>
        <div>
          <Label>{nl ? "Plaats voor een nieuwe dag" : "Location for a new day"}</Label>
          <Input
            value={newDayLocation}
            onChange={(event) => setNewDayLocation(event.target.value)}
            placeholder={nl ? "bv. Kelder" : "e.g. Basement"}
          />
        </div>
        {kind === "BUREAU" && (
          <div>
            <Label>{nl ? "Formulier opent (dagen vooraf)" : "Form opens (days before)"}</Label>
            <Input type="number" min={0} name="opensDaysBefore" defaultValue={defaultOpensDaysBefore ?? 7} />
          </div>
        )}
      </div>
      <p className="text-xs text-[#5c667f]">
        {nl
          ? "Deze twee vullen enkel de volgende dag in die je aanduidt. Hieronder pas je per dag aan; een vergadering hoeft niet elke week op hetzelfde uur of dezelfde plaats te vallen."
          : "These two only fill in the next day you mark. Adjust per day below; a meeting need not be at the same time or place every week."}
      </p>

      {selectedDays.length > 0 && (
        <div className="space-y-2">
          <div className="hidden gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-[#5c667f] sm:grid sm:grid-cols-[8rem_7rem_1fr]">
            <span>{nl ? "Dag" : "Day"}</span>
            <span>{nl ? "Uur" : "Time"}</span>
            <span>{nl ? "Plaats" : "Location"}</span>
          </div>
          {selectedDays.map((day, index) => (
            <div
              key={day}
              className="grid gap-2 rounded-xl border border-vtk-blue/10 p-3 sm:grid-cols-[8rem_7rem_1fr] sm:items-center"
            >
              <input type="hidden" name={`day-${index}-date`} value={day} />
              <div className="text-sm text-vtk-ink">
                <span className="capitalize">{dayLabel(day)}</span>
                {(plannedByDay.get(day)?.reservations ?? 0) > 0 && (
                  <span className="ml-2 text-xs text-[#5c667f]">
                    {plannedByDay.get(day)?.reservations}{" "}
                    {nl ? "bestellingen" : "orders"}
                  </span>
                )}
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f] sm:hidden">
                  {nl ? "Uur" : "Time"}
                </span>
                <Input
                  type="time"
                  name={`day-${index}-time`}
                  value={days.get(day)?.time ?? ""}
                  onChange={(event) => updateDay(day, { time: event.target.value })}
                  required
                />
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f] sm:hidden">
                  {nl ? "Plaats" : "Location"}
                </span>
                <Input
                  name={`day-${index}-location`}
                  value={days.get(day)?.location ?? ""}
                  onChange={(event) => updateDay(day, { location: event.target.value })}
                  placeholder={nl ? "bv. Kelder" : "e.g. Basement"}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SaveForm>
  );
}

function DayCell({
  nl,
  day,
  first,
  selected,
  locked,
  onToggle,
}: {
  nl: boolean;
  day: { value: string; day: number; weekday: number };
  first: boolean;
  selected: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const weekend = day.weekday >= 6;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      title={
        locked
          ? nl
            ? "Er is al besteld voor deze dag"
            : "Orders already exist for this day"
          : day.value
      }
      // De eerste dag van de maand schuift naar haar weekdag; de rest volgt vanzelf.
      style={first ? { gridColumnStart: day.weekday } : undefined}
      className={`h-8 rounded-lg border text-xs tabular-nums transition-colors ${
        selected
          ? "border-vtk-ink bg-vtk-ink text-white"
          : weekend
            ? "border-vtk-blue/10 bg-vtk-blue-soft/40 text-[#8b95ad]"
            : "border-vtk-blue/10 text-vtk-ink hover:bg-vtk-blue-soft"
      } ${locked ? "cursor-not-allowed opacity-80" : ""}`}
    >
      {day.day}
      {locked && <span aria-hidden="true"> ·</span>}
    </button>
  );
}
