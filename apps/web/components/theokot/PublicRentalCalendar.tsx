"use client";

import { useMemo, useState } from "react";
import { RentalMonthGrid, type MonthGridCell } from "./RentalMonthGrid";
import { groupByDay } from "./rentalGrid";
import type { PublicRentalSlot } from "./publicRentalSlots";

export type { PublicRentalSlot };

/**
 * De publieke beschikbaarheidskalender van het Theokot.
 *
 * Ze bestaat om één reden: iemand die de zaal wil huren, moet vóór hij het
 * formulier invult kunnen zien of zijn avond nog vrij is. Zonder dat kwamen de
 * aanvragen dubbel binnen en moest Theokot ze met de hand weigeren.
 *
 * Daarom leest ze **vrij** en niet enkel bezet. Een lege dag in een raster zegt
 * strikt genomen hetzelfde, maar iemand die voor het eerst op deze pagina komt
 * weet niet of die dag leeg is of de kalender onvolledig; een dag die zichzelf
 * vrij noemt, zegt het wel.
 *
 * Wat er niet in staat, staat er met opzet niet in:
 *
 *  - **Namen, adressen, telefoonnummers.** De server geeft ze niet mee, ook niet
 *    onzichtbaar: alles wat deze component krijgt, staat in de HTML van de
 *    pagina. De aard van de activiteit komt enkel mee wanneer wie de verhuur
 *    doet ze per aanvraag heeft vrijgegeven.
 *  - **Aanvragen die nog niet beslist zijn.** Die zouden een avond bezet zetten
 *    die niemand heeft.
 */

export type PublicCalendarCopy = {
  intro: string;
  previous: string;
  next: string;
  today: string;
  free: string;
  busy: string;
  /** "Te kort dag": binnen de wachttijd, dus niet meer aan te vragen. */
  soon: string;
  past: string;
  closedForRequests: string;
  listTitle: string;
  listEmpty: string;
  leadNote: string | null;
};

/** Hoeveel maanden vooruit er te bladeren valt; even ver als de server meegeeft. */
const MONTHS_AHEAD = 12;

/** Het woord dat een schermlezer per dag hoort, per toestand van die dag. */
const STATE_WORD: Record<"past" | "busy" | "soon" | "free", (copy: PublicCalendarCopy) => string> = {
  past: (copy) => copy.past,
  busy: (copy) => copy.busy,
  soon: (copy) => copy.soon,
  free: (copy) => copy.free,
};

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

export function PublicRentalCalendar({
  nl,
  slots,
  todayKey,
  earliestKey,
  copy,
}: {
  nl: boolean;
  slots: PublicRentalSlot[];
  /** Vandaag als "YYYY-MM-DD" in Brussel, van de server. */
  todayKey: string;
  /**
   * De eerste dag die nog aan te vragen valt: vandaag plus de wachttijd uit de
   * instellingen. `null` wanneer het formulier dicht staat; dan is niets vrij om
   * aan te vragen en zegt de kalender enkel wat bezet is.
   */
  earliestKey: string | null;
  copy: PublicCalendarCopy;
}) {
  const [year, month] = todayKey.split("-").map(Number);
  const firstOfThisMonth = useMemo(
    () => new Date(year!, month! - 1, 1),
    [year, month],
  );
  const [cursor, setCursor] = useState<Date>(firstOfThisMonth);

  const byDay = useMemo(() => groupByDay(slots), [slots]);

  const monthFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    month: "long",
    year: "numeric",
  });

  const atStart = monthIndex(cursor) <= monthIndex(firstOfThisMonth);
  const atEnd = monthIndex(cursor) >= monthIndex(firstOfThisMonth) + MONTHS_AHEAD;

  const step = (direction: 1 | -1) =>
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));

  /**
   * Vier toestanden, en de volgorde waarin ze elkaar overrulen is de volgorde
   * waarin ze hier staan: een voorbije dag zegt niets meer over beschikbaarheid,
   * een bezette dag is bezet ook al valt ze binnen de wachttijd, en pas wat
   * overblijft is echt vrij.
   */
  const stateOf = (cell: MonthGridCell): "past" | "busy" | "soon" | "free" | undefined => {
    if (cell.outside) return undefined;
    if (cell.key < todayKey) return "past";
    if (byDay.has(cell.key)) return "busy";
    if (earliestKey === null) return undefined;
    if (cell.key < earliestKey) return "soon";
    return "free";
  };

  // De lijst onder het raster is wat een telefoon in de plaats van het raster
  // krijgt: zeven kolommen van een centimeter zijn daar geen kalender meer.
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const listSlots = slots.filter(
    (slot) => slot.day.startsWith(monthPrefix) && slot.day >= todayKey,
  );

  return (
    <div className="tv-avail">
      <p className="tv-lead">{copy.intro}</p>

      <div className="tv-toolbar">
        <button
          type="button"
          className="tv-step"
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label={copy.previous}
        >
          ‹
        </button>
        <button
          type="button"
          className="tv-step"
          onClick={() => step(1)}
          disabled={atEnd}
          aria-label={copy.next}
        >
          ›
        </button>
        <span className="tv-toolbar-title" aria-live="polite">
          {monthFmt.format(cursor)}
        </span>
        {!atStart && (
          <button type="button" className="tv-today" onClick={() => setCursor(firstOfThisMonth)}>
            {copy.today}
          </button>
        )}
      </div>

      <p className="tv-legend">
        {earliestKey !== null && (
          <span>
            <i data-state="free" />
            {copy.free}
          </span>
        )}
        <span>
          <i data-state="busy" />
          {copy.busy}
        </span>
        {earliestKey === null && <span>{copy.closedForRequests}</span>}
      </p>

      <RentalMonthGrid
        nl={nl}
        cursor={cursor}
        todayKey={todayKey}
        cellState={stateOf}
        renderCell={(cell) => {
          const state = stateOf(cell);
          return (
            <>
              {/* Kleur is hier het hele verhaal, en een schermlezer hoort geen
                  gele streep. Eén woord per dag, onzichtbaar, maakt het raster
                  ook voorleesbaar: "12, vrij". */}
              {state && <span className="sr-only">{STATE_WORD[state](copy)}</span>}
              {(byDay.get(cell.key) ?? []).map((slot) => (
                <span key={slot.id} className="tv-slot">
                  <strong>{slot.timeLabel}</strong>
                  <span>{slot.title ?? copy.busy}</span>
                </span>
              ))}
            </>
          );
        }}
      />

      {copy.leadNote && <p className="tv-avail-note">{copy.leadNote}</p>}

      <div className="tv-avail-list">
        <h3>
          {copy.listTitle} {monthFmt.format(cursor)}
        </h3>
        {listSlots.length === 0 ? (
          <p className="tv-avail-note">{copy.listEmpty}</p>
        ) : (
          <ul>
            {listSlots.map((slot) => (
              <li key={slot.id}>
                <span className="tv-avail-day">{slot.dayLabel}</span>
                <span className="tv-avail-time">{slot.timeLabel}</span>
                <span className="tv-avail-what">{slot.title ?? copy.busy}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
