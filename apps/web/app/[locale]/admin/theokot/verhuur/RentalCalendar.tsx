"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RENTAL_STATUS_META, isDeclinedRental } from "@/lib/theokotVerhuur";
import type { RentalView } from "./types";

/**
 * De verhuurkalender: maand, week en dag.
 *
 * Waar deze kalender voor bestaat: zien of de zaal die dag al bezet is. Daarom
 * staat een goedgekeurde verhuur er vol op en een aanvraag die nog wacht dof met
 * een streepjesrand. Dat onderscheid zit in de CSS (`.tv-chip[data-status]`),
 * niet in de kleur alleen, zodat het ook leesbaar is voor wie kleuren moeilijk
 * uit elkaar houdt.
 *
 * Wat geweigerd of geannuleerd is, staat er standaard **niet** op: die zeggen
 * niets over of de zaal vrij is. Een vinkje zet ze terug, doorstreept, voor wie
 * wil nagaan of er al eens geweigerd werd.
 *
 * Alle aanvragen van het werkingsjaar zitten al in `rentals`, dus bladeren
 * tussen maanden haalt niets op. De datumrekenkunde gebeurt op jaar/maand/dag en
 * niet op instants: `rental.day` en `rental.minutes` staan er al in
 * Brussel-wandklok in (zie `types.ts`).
 */

const VIEWS = ["month", "week", "day"] as const;
type View = (typeof VIEWS)[number];

/** Het volledige etmaal: een verhuur begint 's avonds en eindigt na middernacht. */
const HOURS = Array.from({ length: 25 }, (_, i) => i);
const HOUR_PX = 46;
/** Waar het raster op opent; eerder op de dag staat de zaal toch leeg. */
const SCROLL_TO_HOUR = 16;

const VIEW_LABELS: Record<View, { nl: string; en: string }> = {
  month: { nl: "Maand", en: "Month" },
  week: { nl: "Week", en: "Week" },
  day: { nl: "Dag", en: "Day" },
};

/** De kleur van een blokje volgt zijn toon; de status zelf staat in de CSS. */
const TONE_COLOUR: Record<string, string> = {
  waiting: "#B45309",
  ok: "#0E9F6E",
  no: "#BE123C",
  done: "#5C667F",
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

export function RentalCalendar({
  nl,
  rentals,
  selectedId,
  onSelect,
}: {
  nl: boolean;
  rentals: RentalView[];
  selectedId: string | null;
  onSelect: (rental: RentalView) => void;
}) {
  const [view, setView] = useState<View>("month");
  const [showDeclined, setShowDeclined] = useState(false);
  const [cursor, setCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const bodyRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => (showDeclined ? rentals : rentals.filter((rental) => !isDeclinedRental(rental.status))),
    [rentals, showDeclined],
  );
  const declinedCount = rentals.filter((rental) => isDeclinedRental(rental.status)).length;

  const byDay = useMemo(() => {
    const map = new Map<string, RentalView[]>();
    for (const rental of visible) {
      const bucket = map.get(rental.day);
      if (bucket) bucket.push(rental);
      else map.set(rental.day, [rental]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.minutes - b.minutes);
    return map;
  }, [visible]);

  // Bij het openen van week of dag meteen naar de avond scrollen; anders staat
  // het raster op middernacht en lijkt de dag leeg.
  useEffect(() => {
    if (view === "month") return;
    const body = bodyRef.current;
    if (body) body.scrollTop = Math.max(0, SCROLL_TO_HOUR * HOUR_PX - 8);
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
  const dates =
    view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(cursor), i)) : [cursor];
  const weekdayLabels = nl
    ? ["ma", "di", "wo", "do", "vr", "za", "zo"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="tv-toolbar">
        <button
          type="button"
          className="tv-step"
          onClick={() => step(-1)}
          aria-label={nl ? "Vorige" : "Previous"}
        >
          ‹
        </button>
        <button
          type="button"
          className="tv-step"
          onClick={() => step(1)}
          aria-label={nl ? "Volgende" : "Next"}
        >
          ›
        </button>
        <span className="tv-toolbar-title">
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

        <div className="tv-spacer tv-segment" role="group" aria-label={nl ? "Weergave" : "View"}>
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

      <p className="tv-legend">
        <span>
          <i style={{ background: TONE_COLOUR.ok }} />
          {nl ? "Goedgekeurd: de zaal is bezet" : "Approved: the room is taken"}
        </span>
        <span>
          <i
            style={{
              background: "transparent",
              border: `1px dashed ${TONE_COLOUR.waiting}`,
            }}
          />
          {nl ? "Aangevraagd, nog niet beslist" : "Requested, not decided yet"}
        </span>
        {/* De legende beschrijft wat er staat, dus de derde toestand hoort bij
            het vinkje dat haar aan- en uitzet in plaats van er los boven. */}
        <label className="tv-legend-toggle">
          <input
            type="checkbox"
            checked={showDeclined}
            onChange={(event) => setShowDeclined(event.target.checked)}
          />
          <i style={{ background: TONE_COLOUR.no, opacity: 0.5 }} />
          {nl ? "Geweigerd of geannuleerd tonen" : "Show denied or cancelled"}
          {declinedCount > 0 ? ` (${declinedCount})` : ""}
        </label>
      </p>

      {view === "month" ? (
        <div className="tv-month">
          <div className="tv-month-head">
            {weekdayLabels.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
          <div className="tv-month-body">
            {monthCells(cursor).map((date) => {
              const key = dayKey(date);
              const dayRentals = byDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className="tv-day"
                  data-outside={date.getMonth() !== cursor.getMonth()}
                  data-today={key === today}
                >
                  <span className="tv-daynum">{date.getDate()}</span>
                  {dayRentals.map((rental) => (
                    <Chip
                      key={rental.id}
                      nl={nl}
                      rental={rental}
                      selected={rental.id === selectedId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="tv-time">
          <div
            className="tv-time-head"
            style={{ gridTemplateColumns: `48px repeat(${dates.length}, minmax(0, 1fr))` }}
          >
            <div />
            {dates.map((date) => (
              <div key={dayKey(date)} data-today={dayKey(date) === today}>
                <div className="tv-dow">{weekdayLabels[(date.getDay() + 6) % 7]}</div>
                <div className="tv-dom">{date.getDate()}</div>
              </div>
            ))}
          </div>
          <div
            className="tv-time-body"
            ref={bodyRef}
            style={{ gridTemplateColumns: `48px repeat(${dates.length}, minmax(0, 1fr))` }}
          >
            <div className="tv-hours">
              {HOURS.map((hour) => (
                <div key={hour}>{`${String(hour % 24).padStart(2, "0")}:00`}</div>
              ))}
            </div>
            {dates.map((date) => {
              const key = dayKey(date);
              const dayRentals = byDay.get(key) ?? [];
              return (
                <div key={key} className="tv-col" style={{ height: HOURS.length * HOUR_PX }}>
                  {HOURS.map((hour, index) => (
                    <div key={hour} className="tv-hourline" style={{ top: index * HOUR_PX }} />
                  ))}
                  {dayRentals.map((rental) => {
                    // Een verhuur die over middernacht loopt, kappen we op het
                    // einde van de dag af: hem over de rand laten steken zou het
                    // raster verschuiven, en het echte einduur staat in de tekst.
                    const end = Math.min(rental.endMinutes, 24 * 60);
                    return (
                      <div
                        key={rental.id}
                        className="tv-event"
                        style={{
                          top: (rental.minutes / 60) * HOUR_PX,
                          height: Math.max(26, ((end - rental.minutes) / 60) * HOUR_PX),
                        }}
                      >
                        <Chip
                          nl={nl}
                          rental={rental}
                          selected={rental.id === selectedId}
                          onSelect={onSelect}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Eén verhuur als klikbaar blokje. */
function Chip({
  nl,
  rental,
  selected,
  onSelect,
}: {
  nl: boolean;
  rental: RentalView;
  selected: boolean;
  onSelect: (rental: RentalView) => void;
}) {
  const meta = RENTAL_STATUS_META[rental.status];
  return (
    <button
      type="button"
      className="tv-chip"
      data-status={rental.status}
      aria-current={selected}
      style={{ ["--tone" as string]: TONE_COLOUR[meta.tone] }}
      onClick={() => onSelect(rental)}
      title={`${rental.timeLabel} · ${rental.responsibleName} — ${rental.purpose} (${meta[nl ? "nl" : "en"]})`}
    >
      <span>
        <strong>{rental.startInput}</strong>
        {rental.responsibleName}
      </span>
      <span className="opacity-70">{rental.purpose}</span>
    </button>
  );
}
