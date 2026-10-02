"use client";

import { useCallback, useMemo, useState } from "react";
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
  viewCalendar: string;
  viewList: string;
  pickDate: string;
  freeDesc: string;
  busyDesc: string;
  soonDesc: string;
  pastDesc: string;
  closedDesc: string;
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

function formatSelectedDate(key: string, nl: boolean): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  const fmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const text = fmt.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
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
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const byDay = useMemo(() => groupByDay(slots), [slots]);

  const monthFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    month: "long",
    year: "numeric",
  });

  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
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
  const stateOf = useCallback(
    (cell: MonthGridCell): "past" | "busy" | "soon" | "free" | undefined => {
      if (cell.outside) return undefined;
      if (cell.key < todayKey) return "past";
      if (byDay.has(cell.key)) return "busy";
      if (earliestKey === null) return undefined;
      if (cell.key < earliestKey) return "soon";
      return "free";
    },
    [byDay, earliestKey, todayKey],
  );

  const stateOfKey = useCallback(
    (key: string): "past" | "busy" | "soon" | "free" | "closed" => {
      if (key < todayKey) return "past";
      if (byDay.has(key)) return "busy";
      if (earliestKey === null) return "closed";
      if (key < earliestKey) return "soon";
      return "free";
    },
    [byDay, earliestKey, todayKey],
  );

  const cellAriaLabel = (cell: MonthGridCell): string => {
    const [y, m, d] = cell.key.split("-").map(Number);
    const date = new Date(y!, m! - 1, d!);
    const dayLabel = dayFmt.format(date);
    const state = stateOf(cell);
    const stateLabel = state && state in STATE_WORD ? STATE_WORD[state](copy) : "";
    const slotsOnDay = byDay.get(cell.key) ?? [];
    const slotTexts = slotsOnDay.map((s) => `${s.timeLabel}: ${s.title ?? copy.busy}`).join(", ");
    return [dayLabel, stateLabel, slotTexts].filter(Boolean).join(", ");
  };

  const handlePickDate = (key: string) => {
    const input = document.getElementById("tv-date") as HTMLInputElement | null;
    if (input) {
      input.value = key;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const selectedState = selectedKey ? stateOfKey(selectedKey) : null;
  const selectedSlots = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  const detailTone = (
    state: "past" | "busy" | "soon" | "free" | "closed",
  ): "ok" | "waiting" | "no" | "done" => {
    switch (state) {
      case "free":
        return "ok";
      case "soon":
        return "waiting";
      case "busy":
        return "no";
      case "past":
      case "closed":
        return "done";
    }
  };

  const detailBadge = (
    state: "past" | "busy" | "soon" | "free" | "closed",
  ): string => {
    switch (state) {
      case "free":
        return copy.free;
      case "soon":
        return copy.soon;
      case "busy":
        return copy.busy;
      case "past":
        return copy.past;
      case "closed":
        return copy.closedForRequests;
    }
  };

  const detailDesc = (
    state: "past" | "busy" | "soon" | "free" | "closed",
  ): string => {
    switch (state) {
      case "free":
        return copy.freeDesc;
      case "soon":
        return copy.leadNote ?? copy.soonDesc;
      case "busy":
        return copy.busyDesc;
      case "past":
        return copy.pastDesc;
      case "closed":
        return copy.closedDesc;
    }
  };

  // De lijst onder het raster is wat een bezoeker in lijstweergave
  // krijgt: alle bezette avonden in de actieve maand.
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

        <div className="tv-view-switch" role="group" aria-label={nl ? "Weergave" : "View"}>
          <button
            type="button"
            className={viewMode === "calendar" ? "on" : ""}
            onClick={() => setViewMode("calendar")}
            aria-pressed={viewMode === "calendar"}
          >
            {copy.viewCalendar}
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "on" : ""}
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
          >
            {copy.viewList}
          </button>
        </div>
      </div>

      <div className={viewMode === "calendar" ? "tv-view-calendar" : "tv-view-calendar tv-hidden-view"}>
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
          selectedKey={selectedKey}
          onSelectDate={setSelectedKey}
          cellAriaLabel={cellAriaLabel}
          renderCell={(cell) => {
            const state = stateOf(cell);
            const cellSlots = byDay.get(cell.key) ?? [];
            return (
              <>
                {/* Kleur is hier het hele verhaal, en een schermlezer hoort geen
                    gele streep. Eén woord per dag, onzichtbaar, maakt het raster
                    ook voorleesbaar: "12, vrij". */}
                {state && state in STATE_WORD && (
                  <span className="sr-only">{STATE_WORD[state](copy)}</span>
                )}
                {cellSlots.map((slot) => (
                  <span key={slot.id} className="tv-slot">
                    <strong>{slot.timeLabel}</strong>
                    <span>{slot.title ?? copy.busy}</span>
                  </span>
                ))}
                <span className="tv-dots" aria-hidden="true">
                  {state === "busy" && <i className="tv-dot" data-state="busy" />}
                  {state === "free" && <i className="tv-dot" data-state="free" />}
                </span>
              </>
            );
          }}
        />

        {copy.leadNote && <p className="tv-avail-note">{copy.leadNote}</p>}

        {selectedKey && selectedState && (
          <div className="tv-day-detail" aria-live="polite">
            <div className="tv-day-detail-head">
              <span className="tv-day-detail-date">{formatSelectedDate(selectedKey, nl)}</span>
              <span className="tv-badge" data-tone={detailTone(selectedState)}>
                {detailBadge(selectedState)}
              </span>
            </div>

            <p className="tv-day-detail-desc">{detailDesc(selectedState)}</p>

            {selectedSlots.length > 0 && (
              <ul className="tv-day-detail-slots">
                {selectedSlots.map((slot) => (
                  <li key={slot.id} className="tv-day-detail-slot">
                    <span className="tv-avail-time">{slot.timeLabel}</span>
                    <span className="tv-avail-what">{slot.title ?? copy.busy}</span>
                  </li>
                ))}
              </ul>
            )}

            {selectedState === "free" && (
              <button
                type="button"
                className="tv-pick-date-btn"
                onClick={() => handlePickDate(selectedKey)}
              >
                {copy.pickDate}
              </button>
            )}
          </div>
        )}
      </div>

      <div className={viewMode === "list" ? "tv-avail-list tv-view-list-active" : "tv-avail-list"}>
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
