"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VisitView } from "./types";

/**
 * De kalender uit de oude lesbezoeken-app: maand, week en dag, met een blokje per
 * bezoek in de kleur van zijn organisatie.
 *
 * Alle bezoeken van het werkingsjaar zitten al in `visits`, dus bladeren tussen
 * maanden haalt niets op. De datumrekenkunde gebeurt op jaar/maand/dag en niet op
 * instants: `visit.day` en `visit.minutes` staan er al in Brussel-wandklok in
 * (zie `types.ts`), zodat het raster nergens een tijdzone hoeft te kennen.
 */

const VIEWS = ["month", "week", "day"] as const;
type View = (typeof VIEWS)[number];

/** Het venster dat het week- en dagraster toont. Buiten 7-22u is er geen les. */
const FIRST_HOUR = 7;
const LAST_HOUR = 22;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
const HOUR_PX = 52;

const VIEW_LABELS: Record<View, { nl: string; en: string }> = {
  month: { nl: "Maand", en: "Month" },
  week: { nl: "Week", en: "Week" },
  day: { nl: "Dag", en: "Day" },
};

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** De maandag van de week waar `date` in valt. */
function mondayOf(date: Date): Date {
  const shift = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
}

/** Zes rijen van zeven dagen, maandag eerst; hetzelfde raster als /kalender. */
function monthCells(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = mondayOf(first);
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function LesbezoekCalendar({
  nl,
  visits,
  selectedId,
  onSelect,
}: {
  nl: boolean;
  visits: VisitView[];
  selectedId: string | null;
  onSelect: (visit: VisitView) => void;
}) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const bodyRef = useRef<HTMLDivElement>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, VisitView[]>();
    for (const visit of visits) {
      const bucket = map.get(visit.day);
      if (bucket) bucket.push(visit);
      else map.set(visit.day, [visit]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.minutes - b.minutes);
    return map;
  }, [visits]);

  // Bij het openen van week of dag meteen naar de ochtend scrollen; anders staat
  // het raster op middernacht en lijkt de dag leeg.
  useEffect(() => {
    if (view === "month") return;
    const body = bodyRef.current;
    if (body) body.scrollTop = Math.max(0, (8 - FIRST_HOUR) * HOUR_PX - 8);
  }, [view]);

  const step = (direction: 1 | -1) => {
    if (view === "month") {
      setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    } else {
      setCursor((prev) => addDays(prev, direction * (view === "week" ? 7 : 1)));
    }
  };

  const monthFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    month: "long",
    year: "numeric",
  });
  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const today = dayKey(new Date());
  const dates = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(cursor), i)) : [cursor];
  const weekdayLabels = nl
    ? ["ma", "di", "wo", "do", "vr", "za", "zo"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="lb-toolbar">
        <button type="button" className="lb-step" onClick={() => step(-1)} aria-label={nl ? "Vorige" : "Previous"}>
          ‹
        </button>
        <button type="button" className="lb-step" onClick={() => step(1)} aria-label={nl ? "Volgende" : "Next"}>
          ›
        </button>
        <span className="lb-toolbar-title">
          {view === "day" ? dayFmt.format(cursor) : monthFmt.format(cursor)}
        </span>
        <button
          type="button"
          className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60"
          onClick={() => {
            const now = new Date();
            setCursor(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
          }}
        >
          {nl ? "Vandaag" : "Today"}
        </button>

        <div className="lb-spacer lb-segment" role="group" aria-label={nl ? "Weergave" : "View"}>
          {VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {VIEW_LABELS[value][nl ? "nl" : "en"]}
            </button>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <div className="lb-month">
          <div className="lb-month-head">
            {weekdayLabels.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
          <div className="lb-month-body">
            {monthCells(cursor).map((date) => {
              const key = dayKey(date);
              const dayVisits = byDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className="lb-day"
                  data-outside={date.getMonth() !== cursor.getMonth()}
                  data-today={key === today}
                >
                  <span className="lb-daynum">{date.getDate()}</span>
                  {dayVisits.map((visit) => (
                    <Chip key={visit.id} visit={visit} selected={visit.id === selectedId} onSelect={onSelect} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="lb-time">
          <div
            className="lb-time-head"
            style={{ gridTemplateColumns: `48px repeat(${dates.length}, minmax(0, 1fr))` }}
          >
            <div />
            {dates.map((date) => (
              <div key={dayKey(date)} data-today={dayKey(date) === today}>
                <div className="lb-dow">{weekdayLabels[(date.getDay() + 6) % 7]}</div>
                <div className="lb-dom">{date.getDate()}</div>
              </div>
            ))}
          </div>
          <div
            className="lb-time-body"
            ref={bodyRef}
            style={{ gridTemplateColumns: `48px repeat(${dates.length}, minmax(0, 1fr))` }}
          >
            <div className="lb-hours">
              {HOURS.map((hour) => (
                <div key={hour}>{`${String(hour).padStart(2, "0")}:00`}</div>
              ))}
            </div>
            {dates.map((date) => {
              const key = dayKey(date);
              const dayVisits = byDay.get(key) ?? [];
              return (
                <div key={key} className="lb-col" style={{ height: HOURS.length * HOUR_PX }}>
                  {HOURS.map((hour, index) => (
                    <div key={hour} className="lb-hourline" style={{ top: index * HOUR_PX }} />
                  ))}
                  {dayVisits.map((visit) => (
                    <div
                      key={visit.id}
                      className="lb-event"
                      style={{
                        top: Math.max(0, ((visit.minutes - FIRST_HOUR * 60) / 60) * HOUR_PX),
                        height: Math.max(
                          30,
                          ((visit.endMinutes - visit.minutes) / 60) * HOUR_PX,
                        ),
                      }}
                    >
                      <Chip visit={visit} selected={visit.id === selectedId} onSelect={onSelect} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Eén bezoek als klikbaar blokje. De kleur is die van de organisatie, de status
 * zit in de rand en de doorhaling: op een dag met vijf organisaties is kleur al
 * bezet, dus de status moet er los van leesbaar blijven.
 */
function Chip({
  visit,
  selected,
  onSelect,
}: {
  visit: VisitView;
  selected: boolean;
  onSelect: (visit: VisitView) => void;
}) {
  const hasScheduled = visit.scheduledMails && visit.scheduledMails.length > 0;
  return (
    <button
      type="button"
      className="lb-chip"
      data-status={visit.status}
      aria-current={selected}
      style={{ ["--org" as string]: visit.organisationColour }}
      onClick={() => onSelect(visit)}
      title={`${visit.time} ${visit.organisationName} — ${visit.course}${hasScheduled ? ` (${visit.scheduledMails[0]!.sendAtShort})` : ""}`}
    >
      <span>
        <strong>{visit.time}</strong>
        {hasScheduled ? "🕒 " : ""}
        {visit.organisationName}
      </span>
      <span className="opacity-70">{visit.audience}</span>
    </button>
  );
}
