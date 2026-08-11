"use client";

import { useState } from "react";
import type { MeetingKind } from "@prisma/client";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { MEETING_DEFAULTS, monthDays, semesterMonths, type Semester } from "@/lib/meetings";
import { planMeetingsAction } from "@/app/actions/meetings";

/** Eén dag die al een moment heeft; met reservaties kan ze niet weg. */
export type PlannedDay = { day: string; reservations: number };

const WEEKDAYS_NL = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * De kalender waarmee het beheer in één beweging een heel semester inplant:
 * duid de dagen aan waarop er een grocomeet of bureau is, geef het uur en
 * eventueel de plaats, en klaar.
 *
 * De voorgestelde dagen (elke vrijdag, elke tweede donderdag) staan bij het
 * openen al aangeduid; het blijft een voorstel, want de praktijk wijkt af van het
 * ritme (feestdagen, blok, een verplaatste vergadering).
 */
export function MeetingPlanner({
  nl,
  kind,
  year,
  semester,
  planned,
  suggested,
  defaultTime,
  defaultLocation,
  defaultOpensDaysBefore,
}: {
  nl: boolean;
  kind: MeetingKind;
  year: number;
  semester: Semester;
  planned: PlannedDay[];
  suggested: string[];
  defaultTime?: string;
  defaultLocation?: string;
  defaultOpensDaysBefore?: number;
}) {
  const plannedByDay = new Map(planned.map((entry) => [entry.day, entry.reservations]));
  const [selected, setSelected] = useState<Set<string>>(
    // Al ingeplande dagen staan aan; is er nog niets, dan vertrekt de kalender
    // van het gewone ritme.
    () => new Set(planned.length > 0 ? planned.map((entry) => entry.day) : suggested),
  );

  function toggle(day: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(day)) {
        // Een dag met reservaties kan hier niet weg: die verwijder je bewust bij
        // het moment zelf, waar de bevestiging zegt wat er verdwijnt.
        if ((plannedByDay.get(day) ?? 0) > 0) return current;
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  const weekdays = nl ? WEEKDAYS_NL : WEEKDAYS_EN;
  const months = semesterMonths(year, semester);
  const monthLabel = (m: { year: number; month: number }) =>
    new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { month: "long", year: "numeric" }).format(
      new Date(Date.UTC(m.year, m.month - 1, 1, 12)),
    );

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
              INVALID_TIME: "Geef een geldig uur op (bv. 12:45).",
              KEPT_WITH_RESERVATIONS:
                "Opgeslagen. Dagen waarvoor al besteld is, bleven staan; verwijder die apart bij het moment zelf.",
            }
          : {
              INVALID_TIME: "Enter a valid time (e.g. 12:45).",
              KEPT_WITH_RESERVATIONS:
                "Saved. Days with existing orders were kept; remove those separately at the meeting itself.",
            }
      }
      fallbackErrorMessage={nl ? "Opslaan van de kalender mislukt." : "Saving the calendar failed."}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="semester" value={semester} />
      {[...selected].map((day) => (
        <input key={day} type="hidden" name="days" value={day} />
      ))}

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
                  selected={selected.has(day.value)}
                  locked={(plannedByDay.get(day.value) ?? 0) > 0}
                  onToggle={() => toggle(day.value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>{nl ? "Uur" : "Time"}</Label>
          <Input type="time" name="time" defaultValue={defaultTime ?? MEETING_DEFAULTS[kind].time} required />
        </div>
        <div>
          <Label>{nl ? "Plaats (optioneel)" : "Location (optional)"}</Label>
          <Input name="location" defaultValue={defaultLocation ?? ""} placeholder={nl ? "bv. Kelder" : "e.g. Basement"} />
        </div>
        {kind === "BUREAU" && (
          <div>
            <Label>{nl ? "Formulier opent (dagen vooraf)" : "Form opens (days before)"}</Label>
            <Input
              type="number"
              min={0}
              name="opensDaysBefore"
              defaultValue={defaultOpensDaysBefore ?? 7}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-[#5c667f]">
        {nl
          ? "Uur en plaats gelden voor de dagen die je nu bijzet. Bestaande momenten houden wat je er apart van maakte."
          : "Time and location apply to the days you add now. Existing meetings keep whatever you set on them separately."}
      </p>
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
