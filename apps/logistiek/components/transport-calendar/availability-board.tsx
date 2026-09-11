'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AVAILABILITY_KINDS, type AvailabilityKind } from '@/lib/availability-day';
import {
  AVAILABILITY_KIND_HINT,
  AVAILABILITY_KIND_LABEL,
  availabilityFillClass,
} from '@/lib/availability-kinds';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { driverColorVar } from '@/lib/driver-colors';
import { startOfBrusselsDay } from '@/lib/week-lanes';
import type { AvailabilityBand } from './types';

/**
 * Wie kan er wanneer rijden, deze week (V1).
 *
 * Een eigen strook onder de planning, met **één rij per chauffeur**. In de
 * planning zelf liggen dezelfde vensters als lichte band achter de ritten.
 *
 * Wat daarbij vastligt:
 * - **Enkel karchauffeurs krijgen een rij**, ook wie niets doorgaf.
 * - **De kleur is dezelfde als in de planning.**
 * - **Het patroon zegt hoe graag.** Vol is "beschikbaar", schuine strepen zijn
 *   "liever niet", stippen zijn "enkel in noodgeval".
 * - **Wie het meest kan, staat boven.**
 * - **Interactieve zoom**: Zowel op desktop (knoppen, Ctrl+wiel, trackpad pinch)
 *   als op mobiel (knoppen, touch pinch) kan worden ingezoomd om specifieke
 *   tijden tot op het kwartier/halfuur nauwkeurig te bekijken.
 * - **Vastgezette chauffeurskolom (sticky)**: Bij horizontaal scrollen blijven
 *   de namen van de chauffeurs altijd links in beeld.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
});
const fullDateFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const momentFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

export type BoardDriver = { id: string; name: string };

/** Eén venster als balkje op de strook. */
type Bar = {
  id: string;
  driverId: string;
  driverName: string;
  kind: AvailabilityKind;
  /** Hoelang dit venster binnen de weergave duurt, voor de volgorde en de telling. */
  minutes: number;
  left: number;
  width: number;
  label: string;
  shortLabel: string;
  title: string;
  fullDate: string;
  timeRange: string;
  duration: string;
  note: string | null;
};

/** "8u" of "1u30", kort genoeg voor naast een naam van dertig tekens. */
function hoursLabel(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes === 0 ? `${whole}u` : `${whole}u${String(minutes).padStart(2, '0')}`;
}

export function AvailabilityBoard({
  days,
  windows,
  drivers,
  driverColors,
}: {
  /** De dagen van de weergave, als ISO-strings van UTC-middernacht. */
  days: string[];
  windows: AvailabilityBand[];
  /** Iedereen die kan rijden (gefilterd op karchauffeurs), ook wie niets doorgaf. */
  drivers: BoardDriver[];
  driverColors?: DriverColorOverrides;
}) {
  const [only, setOnly] = useState<string[]>([]);
  /** Welke soorten getoond worden; leeg betekent alle drie. */
  const [kinds, setKinds] = useState<AvailabilityKind[]>([]);
  /** Zoomniveau: 1 (100%) tot 5 (500%). */
  const [zoom, setZoom] = useState(1);
  /** Geselecteerde balk voor detailweergave (vooral op mobiel). */
  const [selectedBar, setSelectedBar] = useState<Bar | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchState = useRef<{ initialDist: number; initialZoom: number; midX: number } | null>(null);

  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);

  const range = useMemo(() => {
    if (parsedDays.length === 0) return null;
    const from = startOfBrusselsDay(parsedDays[0]);
    const to = startOfBrusselsDay(
      new Date(parsedDays[parsedDays.length - 1].getTime() + DAY_MS)
    );
    return { from, to, span: to - from };
  }, [parsedDays]);

  /**
   * Geankerd zoomen: het tijdstip dat nu gecentreerd is (of onder de muis ligt)
   * blijft op dezelfde plek na de schaling.
   */
  const setZoomAnchored = useCallback(
    (nextZoomOrUpdater: number | ((prev: number) => number), clientAnchorX?: number) => {
      const container = containerRef.current;
      setZoom((prev) => {
        const target =
          typeof nextZoomOrUpdater === 'function' ? nextZoomOrUpdater(prev) : nextZoomOrUpdater;
        const next = Math.min(5, Math.max(1, Math.round(target * 10) / 10));
        if (next === prev) return prev;

        if (container) {
          const rect = container.getBoundingClientRect();
          const anchorX =
            clientAnchorX !== undefined ? clientAnchorX - rect.left : container.clientWidth / 2;
          const oldScroll = container.scrollLeft;
          const oldContentWidth = container.scrollWidth;
          const anchorRatio = (oldScroll + anchorX) / Math.max(1, oldContentWidth);

          requestAnimationFrame(() => {
            if (containerRef.current) {
              const newContentWidth = containerRef.current.scrollWidth;
              containerRef.current.scrollLeft = anchorRatio * newContentWidth - anchorX;
            }
          });
        }

        return next;
      });
    },
    []
  );

  /**
   * Desktop wheel / trackpad pinch zoom.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY;
        const zoomDelta = -delta * 0.005;
        setZoomAnchored((current) => current * (1 + zoomDelta), e.clientX);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoomAnchored]);

  /**
   * Touch pinch-to-zoom voor mobiel.
   */
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      touchState.current = { initialDist: dist, initialZoom: zoom, midX };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (touchState.current.initialDist > 10) {
        const factor = dist / touchState.current.initialDist;
        const newZoom = touchState.current.initialZoom * factor;
        setZoomAnchored(newZoom, touchState.current.midX);
      }
    }
  };

  const handleTouchEnd = () => {
    touchState.current = null;
  };

  /**
   * De vensters per chauffeur, geknipt op het venster van de weergave.
   */
  const perDriver = useMemo(() => {
    const map = new Map<string, Bar[]>();
    if (!range) return map;
    for (const window of windows) {
      if (kinds.length > 0 && !kinds.includes(window.kind)) continue;
      const start = new Date(window.startAt).getTime();
      const end = new Date(window.endAt).getTime();
      if (end <= range.from || start >= range.to) continue;
      const from = Math.max(start, range.from);
      const to = Math.min(end, range.to);
      const minutes = (to - from) / 60000;
      const durationHours = minutes / 60;
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const timeRange = `${timeFormatter.format(fromDate)} – ${timeFormatter.format(toDate)}`;
      const duration = hoursLabel(durationHours);

      const bars = map.get(window.driverId) ?? [];
      bars.push({
        id: window.id,
        driverId: window.driverId,
        driverName: window.driverName,
        kind: window.kind,
        minutes,
        left: ((from - range.from) / range.span) * 100,
        width: Math.max(0.3, ((to - from) / range.span) * 100),
        label: `${timeRange} (${duration})`,
        shortLabel: timeRange,
        title: `${window.driverName}, ${AVAILABILITY_KIND_LABEL[window.kind].toLowerCase()}: ${momentFormatter.format(new Date(start))} tot ${momentFormatter.format(new Date(end))}${window.note ? ` (${window.note})` : ''}`,
        fullDate: fullDateFormatter.format(fromDate),
        timeRange,
        duration,
        note: window.note,
      });
      map.set(window.driverId, bars);
    }
    return map;
  }, [kinds, range, windows]);

  /**
   * Hoeveel uur iemand van elke soort opgaf binnen dit venster.
   */
  const hoursPerDriver = useMemo(() => {
    const map = new Map<string, Record<AvailabilityKind, number>>();
    for (const [driverId, bars] of perDriver) {
      const totals: Record<AvailabilityKind, number> = { JA: 0, LIEVER_NIET: 0, NOOD: 0 };
      for (const bar of bars) totals[bar.kind] += bar.minutes / 60;
      map.set(driverId, totals);
    }
    return map;
  }, [perDriver]);

  /**
   * Wie iets doorgaf eerst en op volgorde van bruikbaarheid; wie niets doorgaf
   * onderaan.
   */
  const rows = useMemo(() => {
    const chosen = only.length === 0 ? drivers : drivers.filter((driver) => only.includes(driver.id));
    const withWindows = chosen
      .filter((driver) => (perDriver.get(driver.id)?.length ?? 0) > 0)
      .sort((a, b) => {
        const left = hoursPerDriver.get(a.id) ?? { JA: 0, LIEVER_NIET: 0, NOOD: 0 };
        const right = hoursPerDriver.get(b.id) ?? { JA: 0, LIEVER_NIET: 0, NOOD: 0 };
        return (
          right.JA - left.JA ||
          right.LIEVER_NIET - left.LIEVER_NIET ||
          right.NOOD - left.NOOD ||
          a.name.localeCompare(b.name)
        );
      });
    const without = chosen.filter((driver) => (perDriver.get(driver.id)?.length ?? 0) === 0);
    return { withWindows, without };
  }, [drivers, hoursPerDriver, only, perDriver]);

  /**
   * Dynamische tijdsverdeling (ticks) afhankelijk van het zoomniveau en het
   * aantal dagen.
   */
  const { ticks, tickStepHours } = useMemo(() => {
    const dayCount = parsedDays.length;
    let step = 6;
    if (dayCount <= 1) {
      step = zoom >= 3 ? 0.5 : zoom >= 1.5 ? 1 : 2;
    } else if (dayCount <= 7) {
      if (zoom >= 4) step = 0.5;
      else if (zoom >= 2.5) step = 1;
      else if (zoom >= 1.5) step = 3;
      else step = 6;
    } else {
      step = zoom >= 4 ? 3 : zoom >= 2 ? 6 : 24;
    }

    const out: Array<{
      left: number;
      hour: number;
      isDay: boolean;
      isHalfHour: boolean;
      label?: string;
    }> = [];

    const slotsPerDay = 24 / step;
    for (let day = 0; day < dayCount; day += 1) {
      for (let slot = 0; slot < slotsPerDay; slot += 1) {
        const hourDecimal = slot * step;
        const hour = Math.floor(hourDecimal);
        const isHalfHour = hourDecimal % 1 !== 0;
        const left = ((day + hourDecimal / 24) / dayCount) * 100;
        const isDay = hourDecimal === 0;

        let label: string | undefined = undefined;
        if (isDay) {
          label = '00:00';
        } else if (!isHalfHour) {
          label = `${String(hour).padStart(2, '0')}:00`;
        }

        out.push({
          left,
          hour,
          isDay,
          isHalfHour,
          label,
        });
      }
    }

    return { ticks: out, tickStepHours: step };
  }, [parsedDays.length, zoom]);

  if (!range || drivers.length === 0) return null;

  return (
    <section className="min-w-0 rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-vtk-ink">Wie kan er rijden (karchauffeurs)</h2>
        <p className="text-xs text-vtk-muted">
          Wat de karchauffeurs zelf doorgaven. Het is een hint, geen belofte: je mag ze ook daarbuiten
          vragen.
        </p>
      </div>

      {/* Legende */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {AVAILABILITY_KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5 text-[11px] text-vtk-muted">
            <span
              aria-hidden
              className={`h-3 w-4 rounded-[3px] border border-vtk-navy/25 ${availabilityFillClass(kind)}`}
              style={{ backgroundColor: 'var(--driver-1)' }}
            />
            <span className="font-medium text-vtk-ink">{AVAILABILITY_KIND_LABEL[kind]}</span>
            {AVAILABILITY_KIND_HINT[kind]}
          </span>
        ))}
      </div>

      {/* Werkbalk: Soort filter + Zoom controls */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-y border-vtk-navy/10 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-vtk-muted">
            Toon
          </span>
          <button
            type="button"
            onClick={() => setKinds([])}
            aria-pressed={kinds.length === 0}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              kinds.length === 0
                ? 'border-vtk-navy bg-vtk-navy text-white'
                : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
            }`}
          >
            Alles
          </button>
          {AVAILABILITY_KINDS.map((kind) => {
            const active = kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setKinds((current) =>
                    current.includes(kind)
                      ? current.filter((value) => value !== kind)
                      : [...current, kind]
                  )
                }
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? 'border-vtk-navy bg-vtk-navy/5 text-vtk-ink'
                    : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
                }`}
              >
                {AVAILABILITY_KIND_LABEL[kind]}
              </button>
            );
          })}
        </div>

        {/* Zoombediening (desktop & mobiel) */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-vtk-muted hidden lg:inline">
            Ctrl + scroll of knijp om in te zoomen
          </span>
          <div className="flex items-center gap-1 rounded-full border border-vtk-navy/15 bg-vtk-paper/60 p-0.5">
            <button
              type="button"
              onClick={() => setZoomAnchored((z) => Math.max(1, z - 0.5))}
              disabled={zoom <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-vtk-ink transition hover:bg-vtk-surface disabled:opacity-30"
              title="Uitzoomen"
              aria-label="Uitzoomen"
            >
              −
            </button>
            <span className="min-w-[3rem] px-1 text-center text-xs font-semibold tabular-nums text-vtk-ink">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomAnchored((z) => Math.min(5, z + 0.5))}
              disabled={zoom >= 5}
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-vtk-ink transition hover:bg-vtk-surface disabled:opacity-30"
              title="Inzoomen"
              aria-label="Inzoomen"
            >
              +
            </button>
            {zoom > 1 ? (
              <button
                type="button"
                onClick={() => setZoomAnchored(1)}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium text-vtk-navy hover:bg-vtk-surface transition"
                title="Herstel zoom naar 100%"
              >
                Reset
              </button>
            ) : null}
          </div>

          <div className="hidden sm:flex items-center gap-1">
            {[1, 2, 4].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setZoomAnchored(level)}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                  Math.round(zoom) === level
                    ? 'border-vtk-navy bg-vtk-navy/10 text-vtk-ink font-semibold'
                    : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
                }`}
              >
                {level}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chauffeur filter chips */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOnly([])}
          aria-pressed={only.length === 0}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            only.length === 0
              ? 'border-vtk-navy bg-vtk-navy text-white'
              : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
          }`}
        >
          Iedereen ({drivers.length})
        </button>
        {drivers.map((driver) => {
          const active = only.includes(driver.id);
          return (
            <button
              key={driver.id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setOnly((current) =>
                  current.includes(driver.id)
                    ? current.filter((id) => id !== driver.id)
                    : [...current, driver.id]
                )
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'border-vtk-navy bg-vtk-navy/5 text-vtk-ink'
                  : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full border border-vtk-navy/20"
                style={{ backgroundColor: driverColorVar(driver.id, driverColors) }}
              />
              {driver.name}
            </button>
          );
        })}
      </div>

      {/* Detail inspectiekaartje bij klik of tik op een balk */}
      {selectedBar && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-vtk-navy/15 bg-vtk-paper/80 p-3 text-xs shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full border border-vtk-navy/20"
              style={{ backgroundColor: driverColorVar(selectedBar.driverId, driverColors) }}
            />
            <span className="font-semibold text-vtk-ink">{selectedBar.driverName}</span>
            <span className="text-vtk-muted">·</span>
            <span className="capitalize font-medium text-vtk-ink">{selectedBar.fullDate}</span>
            <span className="text-vtk-muted">·</span>
            <span className="font-semibold tabular-nums text-vtk-ink">{selectedBar.timeRange}</span>
            <span className="text-vtk-muted">({selectedBar.duration})</span>
            <span
              className={`ml-2 inline-flex items-center rounded-full border border-vtk-navy/20 px-2 py-0.5 text-[11px] font-medium ${availabilityFillClass(
                selectedBar.kind
              )}`}
            >
              {AVAILABILITY_KIND_LABEL[selectedBar.kind]}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedBar.note && (
              <span className="rounded border border-vtk-navy/10 bg-vtk-surface px-2 py-0.5 text-[11px] italic text-vtk-body">
                "{selectedBar.note}"
              </span>
            )}
            <button
              type="button"
              onClick={() => setSelectedBar(null)}
              className="rounded-full px-2 py-0.5 text-xs text-vtk-muted hover:bg-vtk-surface hover:text-vtk-ink transition"
              title="Detail sluiten"
              aria-label="Detail sluiten"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Tijdrooster met zoom en sticky chauffeursnamen */}
      <div
        className="mt-3 min-w-0 overflow-x-auto select-none rounded-[12px] border border-vtk-navy/10 bg-vtk-surface"
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="relative min-w-[32rem] p-3 transition-all duration-75"
          style={{ width: `${Math.max(100, zoom * 100)}%` }}
        >
          {/* Dagkop met uurschaal */}
          <div className="flex items-end gap-2 pb-2 border-b border-vtk-navy/10">
            <div className="w-28 sm:w-36 shrink-0 sticky left-0 z-20 bg-vtk-surface pr-2 border-r border-vtk-navy/10">
              <span className="text-[11px] font-semibold text-vtk-muted uppercase tracking-wider">
                Chauffeur
              </span>
            </div>

            <div className="relative flex-1">
              <div
                className="grid gap-px"
                style={{ gridTemplateColumns: `repeat(${parsedDays.length}, minmax(0, 1fr))` }}
              >
                {parsedDays.map((day) => (
                  <span
                    key={day.toISOString()}
                    className="truncate px-1 text-[11px] font-semibold capitalize text-vtk-muted"
                  >
                    {weekdayFormatter.format(day)} {dayNumberFormatter.format(day)}
                  </span>
                ))}
              </div>

              {/* Uurlabels afhankelijk van zoom */}
              <div className="relative mt-1 h-3.5">
                {ticks.map((tick) =>
                  tick.label ? (
                    <span
                      key={`${tick.left}-${tick.hour}`}
                      className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-vtk-muted pointer-events-none"
                      style={{ left: `${tick.left}%` }}
                    >
                      {tick.label}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          </div>

          {/* Chauffeur rijen */}
          <ul className="grid gap-1.5 mt-2">
            {rows.withWindows.map((driver) => {
              const totals = hoursPerDriver.get(driver.id);
              const summary = totals
                ? AVAILABILITY_KINDS.filter((kind) => totals[kind] >= 0.25)
                    .map((kind) =>
                      kind === 'JA'
                        ? hoursLabel(totals[kind])
                        : `${hoursLabel(totals[kind])} ${kind === 'NOOD' ? 'nood' : 'liever niet'}`
                    )
                    .join(' · ')
                : '';

              return (
                <li key={driver.id} className="flex items-center gap-2 group">
                  {/* Sticky Chauffeursnaam links */}
                  <div className="w-28 sm:w-36 shrink-0 sticky left-0 z-20 bg-vtk-surface pr-2 border-r border-vtk-navy/10 py-0.5">
                    <span className="block truncate text-xs font-semibold text-vtk-ink">
                      {driver.name}
                    </span>
                    {summary ? (
                      <span className="block truncate text-[10px] tabular-nums text-vtk-muted">
                        {summary}
                      </span>
                    ) : null}
                  </div>

                  {/* Balken op de tijdslijn */}
                  <div className="relative h-8 flex-1 overflow-hidden rounded-[8px] bg-vtk-paper/70">
                    {/* Ticks */}
                    {ticks.map((tick) =>
                      tick.left === 0 ? null : (
                        <span
                          key={`${tick.left}-${tick.hour}`}
                          aria-hidden
                          className={`absolute inset-y-0 w-px ${
                            tick.isDay
                              ? 'bg-vtk-navy/25 z-1'
                              : tick.isHalfHour
                                ? 'bg-vtk-navy/[0.04]'
                                : 'bg-vtk-navy/[0.08]'
                          }`}
                          style={{ left: `${tick.left}%` }}
                        />
                      )
                    )}

                    {/* Beschikbaarheidsbalken */}
                    {(perDriver.get(driver.id) ?? []).map((bar) => {
                      const isSelected = selectedBar?.id === bar.id;
                      const showLabel = bar.width * zoom >= 3.5;

                      return (
                        <button
                          type="button"
                          key={bar.id}
                          onClick={() => setSelectedBar((curr) => (curr?.id === bar.id ? null : bar))}
                          title={bar.title}
                          className={`absolute inset-y-1 flex items-center overflow-hidden rounded-[6px] border border-vtk-navy/20 px-1.5 text-[10px] font-semibold tabular-nums text-vtk-ink transition cursor-pointer text-left ${
                            isSelected
                              ? 'ring-2 ring-vtk-ink ring-offset-1 z-10 brightness-105'
                              : 'hover:brightness-95 hover:z-10'
                          } ${availabilityFillClass(bar.kind)}`}
                          style={{
                            left: `${bar.left}%`,
                            width: `${bar.width}%`,
                            backgroundColor: driverColorVar(driver.id, driverColors),
                          }}
                        >
                          {showLabel ? (
                            <span className="truncate drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]">
                              {bar.width * zoom >= 7 ? bar.label : bar.shortLabel}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>

          {rows.withWindows.length === 0 ? (
            <p className="py-3 text-xs text-vtk-muted">
              {kinds.length > 0
                ? `Geen karchauffeur gaf voor deze periode "${kinds.map((kind) => AVAILABILITY_KIND_LABEL[kind].toLowerCase()).join('" of "')}" door.`
                : 'Geen karchauffeur gaf voor deze periode beschikbaarheid door.'}
            </p>
          ) : null}

          {rows.withWindows.length > 0 && (
            <p className="mt-2 text-[11px] text-vtk-muted">
              Elk streepje is {tickStepHours} uur, de donkere lijnen zijn de dagranden. Klik of tik op een
              balk voor het exacte uur en details.
            </p>
          )}

          {rows.without.length > 0 ? (
            <p className="mt-2 border-t border-vtk-navy/10 pt-2 text-xs text-vtk-muted">
              <span className="font-medium text-vtk-ink">Niets doorgegeven (karchauffeurs):</span>{' '}
              {rows.without.map((driver) => driver.name).join(', ')}. Dat betekent niet dat ze niet
              kunnen; je weet het gewoon niet.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
