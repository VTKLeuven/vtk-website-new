"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  PAL_PLUS_GRID,
  PAL_PLUS_LIMITS,
  palPlusClock,
  palPlusGridSlots,
  palPlusMomentLabel,
  palPlusSlotIsPast,
  palPlusSlotKey,
  palPlusSlotsToMoments,
  parsePalPlusMoment,
} from "@/lib/palPlus";

import "@/app/design/vtk-palplus-tags.css";

export type MomentGridDay = {
  /** `YYYY-MM-DD` */
  date: string;
  /** "di" */
  weekday: string;
  /** "13" */
  day: string;
  /** "10", valt weg op een smal scherm. */
  month: string;
  /** "dinsdag 13 oktober", voor de screenreader. */
  long: string;
};

export type MomentGridCopy = {
  /** Naam van het rooster voor de screenreader. */
  label: string;
  /** Boven de samenvatting: "Je kan op". */
  chosen: string;
  /** Wanneer er nog niets aangeduid is. */
  empty: string;
  /** Met `{max}`. */
  tooMany: string;
};

type Cell = { day: number; slot: number };
type Drag = { anchor: Cell; add: boolean; base: Set<string> };

/**
 * Het rooster "wanneer kan je de sessie geven?": de komende werkdagen als
 * kolommen, de halve uren als rijen, op echte datums. Slepen duidt een blok
 * aan (of haalt het weg als je op een aangeduid vakje begint), zoals in
 * When2meet; met het toetsenbord gaan de pijltjes rond en zet spatie een vakje
 * aan of uit. Wat al voorbij is, staat uit.
 *
 * Aaneensluitende vakjes worden één blok (`palPlusSlotsToMoments`) en gaan als
 * `momentDate`, `momentStart` en `momentEnd` mee; de server leest ze zoals elk
 * ander moment (`parsePalPlusProposedMoments`).
 *
 * Bewust zelf gebouwd en geen library: de bekende When2meet-kloon voor React
 * brengt styled-components en Emotion mee, een tweede stijlsysteem naast de
 * tokens van de site.
 */
export function MomentGrid({
  days,
  today,
  nowMinutes,
  locale,
  copy,
}: {
  days: MomentGridDay[];
  /** Vandaag in Brussel (`YYYY-MM-DD`) en hoe laat het er is: wat voorbij is, staat uit. */
  today: string;
  nowMinutes: number;
  locale: "nl" | "en";
  copy: MomentGridCopy;
}) {
  const slots = useMemo(() => palPlusGridSlots(), []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState<Cell>({ day: 0, slot: 0 });
  const drag = useRef<Drag | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const past = (cell: Cell) => palPlusSlotIsPast(days[cell.day]!.date, slots[cell.slot]!, today, nowMinutes);
  const keyOf = (cell: Cell) => palPlusSlotKey(days[cell.day]!.date, slots[cell.slot]!);

  /** Het blok tussen het vertrekpunt en `to`, bovenop wat er voor het slepen stond. */
  function paint(current: Drag, to: Cell) {
    const next = new Set(current.base);
    const [d0, d1] = [Math.min(current.anchor.day, to.day), Math.max(current.anchor.day, to.day)];
    const [s0, s1] = [Math.min(current.anchor.slot, to.slot), Math.max(current.anchor.slot, to.slot)];
    for (let day = d0; day <= d1; day += 1) {
      for (let slot = s0; slot <= s1; slot += 1) {
        const cell = { day, slot };
        if (past(cell)) continue;
        if (current.add) next.add(keyOf(cell));
        else next.delete(keyOf(cell));
      }
    }
    setSelected(next);
  }

  function cellAt(x: number, y: number): Cell | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-pp-cell]");
    if (!element || !gridRef.current?.contains(element)) return null;
    return { day: Number(element.dataset.day), slot: Number(element.dataset.slot) };
  }

  // Slepen volgt de pointer over het hele document: een vinger op een
  // aanraakscherm geeft geen pointerenter op de vakjes eronder.
  useEffect(() => {
    function move(event: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current) return;
      const cell = cellAt(event.clientX, event.clientY);
      if (cell) paint(current, cell);
    }
    function end() {
      drag.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  });

  function start(event: PointerEvent<HTMLDivElement>, cell: Cell) {
    if (past(cell) || event.button !== 0) return;
    event.preventDefault();
    // Een vinger houdt anders de pointer vast op het eerste vakje.
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    const current = { anchor: cell, add: !selected.has(keyOf(cell)), base: new Set(selected) };
    drag.current = current;
    setFocus(cell);
    paint(current, cell);
  }

  function toggle(cell: Cell) {
    if (past(cell)) return;
    const key = keyOf(cell);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, Cell> = {
      ArrowUp: { day: focus.day, slot: Math.max(0, focus.slot - 1) },
      ArrowDown: { day: focus.day, slot: Math.min(slots.length - 1, focus.slot + 1) },
      ArrowLeft: { day: Math.max(0, focus.day - 1), slot: focus.slot },
      ArrowRight: { day: Math.min(days.length - 1, focus.day + 1), slot: focus.slot },
    };
    const target = moves[event.key];
    if (target) {
      event.preventDefault();
      setFocus(target);
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-pp-cell][data-day="${target.day}"][data-slot="${target.slot}"]`)
        ?.focus();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle(focus);
    }
  }

  const moments = palPlusSlotsToMoments(selected);
  const labels = moments.flatMap((moment) => {
    const parsed = parsePalPlusMoment(moment.date, moment.startTime, moment.endTime, 24 * 60);
    return parsed.ok ? [palPlusMomentLabel(parsed, locale)] : [];
  });
  const columns = { gridTemplateColumns: `3.2em repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="pp-grid-wrap">
      {moments.map((moment) => (
        <span key={`${moment.date}-${moment.startTime}`} hidden>
          <input type="hidden" name="momentDate" value={moment.date} />
          <input type="hidden" name="momentStart" value={moment.startTime} />
          <input type="hidden" name="momentEnd" value={moment.endTime} />
        </span>
      ))}

      <div ref={gridRef} className="pp-grid" role="grid" aria-label={copy.label} aria-multiselectable="true" onKeyDown={onKeyDown}>
        <div className="pp-grid-row pp-grid-head" role="row" style={columns}>
          <span role="columnheader" aria-hidden="true" />
          {days.map((day) => (
            <span key={day.date} role="columnheader" aria-label={day.long} className="pp-grid-day">
              <span className="pp-grid-weekday">{day.weekday}</span>
              <span className="pp-grid-date">
                {day.day}
                <span className="pp-grid-month">/{day.month}</span>
              </span>
            </span>
          ))}
        </div>
        {slots.map((minutes, slot) => (
          <div
            key={minutes}
            className="pp-grid-row"
            role="row"
            style={columns}
            data-hour={minutes % 60 === 0 ? "true" : undefined}
          >
            <span role="rowheader" className="pp-grid-time" aria-label={palPlusClock(minutes)}>
              {minutes % 60 === 0 ? palPlusClock(minutes) : ""}
            </span>
            {days.map((day, dayIndex) => {
              const cell = { day: dayIndex, slot };
              const key = palPlusSlotKey(day.date, minutes);
              const isPast = past(cell);
              const on = selected.has(key);
              const focused = focus.day === dayIndex && focus.slot === slot;
              return (
                <div
                  key={key}
                  role="gridcell"
                  data-pp-cell=""
                  data-day={dayIndex}
                  data-slot={slot}
                  data-on={on ? "true" : undefined}
                  aria-selected={on}
                  aria-disabled={isPast || undefined}
                  aria-label={`${day.long}, ${palPlusClock(minutes)}-${palPlusClock(minutes + PAL_PLUS_GRID.slotMinutes)}`}
                  tabIndex={focused ? 0 : -1}
                  className="pp-grid-cell"
                  onPointerDown={(event) => start(event, cell)}
                  onFocus={() => setFocus(cell)}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="pp-grid-summary" aria-live="polite">
        {labels.length === 0 ? (
          <p className="pp-help">{copy.empty}</p>
        ) : (
          <>
            <p className="pp-grid-summary-label">{copy.chosen}</p>
            <ul className="pp-moments-read">
              {labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            {moments.length > PAL_PLUS_LIMITS.moments && (
              <p className="pp-help pp-grid-warning">{copy.tooMany.replace("{max}", String(PAL_PLUS_LIMITS.moments))}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
