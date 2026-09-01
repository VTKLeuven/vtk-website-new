'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { setAvailabilityDayAction } from '@/app/actions/uitleen';
import { LogisticsIcon } from '@/components/logistics-icon';
import { useToast } from '@/components/ui/toast';
import { rangeToHours } from '@/lib/availability-day';
import { startOfBrusselsDay } from '@/lib/week-lanes';
import type { AvailabilityWindow } from './availability-editor';

/**
 * Beschikbaarheid intekenen op een telefoon (V1).
 *
 * **Een eigen weergave en niet het tijdrooster dat kleiner gezet is.** In dat
 * rooster teken je met de muis een venster door van een uur naar een ander te
 * slepen, en dat werkt op een touchscreen niet: verticaal vegen is daar
 * scrollen. Op een telefoon kon je dus enkel de twee velden invullen, één
 * venster tegelijk, en dat is precies het omgekeerde van "even snel je week
 * doorgeven".
 *
 * Hier is de week een raster van vakjes van een uur: zeven kolommen, en per uur
 * een rij. Je legt je vinger op een vakje en veegt; alles waar je over gaat
 * krijgt de toestand van het eerste vakje. Begon je op een vakje dat aanstond,
 * dan wis je; begon je op een leeg vakje, dan duid je aan. Dat is het gebaar van
 * een Let's Meet, en het is wat iedereen hier probeert.
 *
 * Wat daarbij vastligt:
 *
 * - **Per uur en niet per kwartier.** Met een vinger mik je geen kwartier. Wie
 *   het precies wil, gebruikt de twee velden eronder of een computer.
 * - **`touch-action: none` op het raster.** Anders scrolt de pagina mee met je
 *   veeg en wordt er niets aangeduid. De pagina blijft scrollen buiten het
 *   raster, en het raster past standaard op één scherm doordat de nacht
 *   ingeklapt is.
 * - **De nacht staat ingeklapt.** Van 00:00 tot 06:00 rijdt er zelden iemand, en
 *   die zes rijen zijn precies wat het raster van het scherm duwt. Eén knop zet
 *   ze erbij.
 * - **Het is een eigen volledig scherm.** Boven het raster stonden de sitekop,
 *   de donkere paginakop en de weeknavigatie samen ruim driehonderd pixels, en
 *   dan blijft er voor achttien rijen te weinig over: het raster puilde uit zijn
 *   kaart en de voetregel viel eroverheen. Nu vult dit scherm de hele telefoon,
 *   met een smalle balk erboven waarin de week staat en waarmee je terug gaat.
 *   De rijen delen wat er overblijft (`1fr`), en de doos eromheen snijdt af
 *   (`overflow: hidden`), zodat er nooit meer iets uit kan lopen.
 * - **Opslaan gebeurt per dag, bij het loslaten.** Niet per vakje: dan stuur je
 *   twintig verzoeken voor één veeg. En niet met een aparte opslaanknop: dan
 *   staat er op het scherm iets anders dan in de databank, en dat is precies wat
 *   je hier niet wil.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Vanaf welk uur het raster standaard begint; de nacht klapt open op verzoek. */
const DEFAULT_FIRST_HOUR = 6;

const ROW_GAP_PX = 2;

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
});
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `2026-09-02:14` als sleutel van één vakje. */
function cellKey(dayIso: string, hour: number): string {
  return `${dayIso}:${hour}`;
}

export function AvailabilityPaint({
  days,
  windows,
  weekLabel,
  previousHref,
  nextHref,
  backHref,
}: {
  /** De week, als ISO-strings van UTC-middernacht. */
  days: string[];
  windows: AvailabilityWindow[];
  /** "Week 36": wat er in de balk bovenaan staat. */
  weekLabel: string;
  previousHref: string;
  nextHref: string;
  /** Terug naar waar dit scherm vandaan komt. */
  backHref: string;
}) {
  const showToast = useToast();
  const [, startTransition] = useTransition();
  const [showNight, setShowNight] = useState(false);

  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);

  /** De vakjes zoals ze uit de opgeslagen vensters volgen. */
  const saved = useMemo(() => {
    const set = new Set<string>();
    for (const day of parsedDays) {
      const dayStart = new Date(startOfBrusselsDay(day));
      const dayEnd = new Date(startOfBrusselsDay(new Date(day.getTime() + DAY_MS)));
      const iso = day.toISOString();
      for (const window of windows) {
        const hours = rangeToHours(
          { startAt: new Date(window.startAt), endAt: new Date(window.endAt) },
          dayStart,
          dayEnd
        );
        for (const hour of hours) set.add(cellKey(iso, hour));
      }
    }
    return set;
  }, [parsedDays, windows]);

  /**
   * Wat er nú aanstaat, inclusief wat nog aan het opslaan is.
   *
   * Eigen state en geen `useOptimistic`: je veegt hier over tien vakjes na
   * elkaar, en die mogen niet één voor één terugspringen terwijl de server nog
   * bezig is. Bij nieuwe gegevens van de server nemen we die over.
   */
  const [cells, setCells] = useState<Set<string>>(saved);
  /**
   * Dezelfde vakjes, maar leesbaar vanuit de aanraakluisteraars.
   *
   * Zonder deze ref moest het opslaan bij het loslaten de nieuwste state uit een
   * `setCells`-updater vissen, en dan draait de server-actie tijdens de render
   * ("Cannot call startTransition while rendering"). De ref is de waarheid voor
   * de gebaren, de state is er voor het tekenen.
   */
  const cellsRef = useRef(cells);
  const savedKey = useMemo(() => [...saved].sort().join('|'), [saved]);
  const lastSavedKey = useRef(savedKey);
  useEffect(() => {
    if (lastSavedKey.current === savedKey) return;
    lastSavedKey.current = savedKey;
    cellsRef.current = saved;
    setCells(saved);
  }, [saved, savedKey]);

  const grid = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  /** De veeg die bezig is: aanduiden of wissen, en welke dagen er geraakt zijn. */
  const stroke = useRef<{ turnOn: boolean; touched: Set<string> } | null>(null);

  const hours = useMemo(() => {
    const first = showNight ? 0 : DEFAULT_FIRST_HOUR;
    return Array.from({ length: 24 - first }, (_, index) => first + index);
  }, [showNight]);


  const save = useCallback(
    (dayIso: string, next: Set<string>) => {
      const day = new Date(dayIso);
      const hoursOn: number[] = [];
      for (let hour = 0; hour < 24; hour += 1) {
        if (next.has(cellKey(dayIso, hour))) hoursOn.push(hour);
      }
      startTransition(async () => {
        const result = await setAvailabilityDayAction({
          day: dayKeyFormatter.format(day),
          hours: hoursOn,
        });
        if (!result.ok) {
          showToast({ message: result.error, variant: 'error', duration: 0 });
        }
      });
    },
    [showToast]
  );

  /**
   * Het vakje onder een punt op het scherm.
   *
   * Via `elementFromPoint` en niet via de gebeurtenis zelf: bij een veeg blijven
   * alle `pointermove`-gebeurtenissen bij het vakje waar je begon (de browser
   * vangt de pointer), dus `event.target` is de hele veeg lang hetzelfde vakje.
   */
  function cellAt(x: number, y: number): { dayIso: string; hour: number } | null {
    const node = document.elementFromPoint(x, y);
    const cell = node?.closest<HTMLElement>('[data-day][data-hour]');
    if (!cell || !grid.current?.contains(cell)) return null;
    return { dayIso: cell.dataset.day as string, hour: Number(cell.dataset.hour) };
  }

  useEffect(() => {
    const node = grid.current;
    if (!node) return;

    function apply(x: number, y: number) {
      const at = cellAt(x, y);
      const current = stroke.current;
      if (!at || !current) return;
      const key = cellKey(at.dayIso, at.hour);
      current.touched.add(at.dayIso);
      if (cellsRef.current.has(key) === current.turnOn) return;
      const next = new Set(cellsRef.current);
      if (current.turnOn) next.add(key);
      else next.delete(key);
      cellsRef.current = next;
      setCells(next);
    }

    function onDown(event: PointerEvent) {
      const at = cellAt(event.clientX, event.clientY);
      if (!at) return;
      event.preventDefault();
      const key = cellKey(at.dayIso, at.hour);
      // De toestand van het eerste vakje bepaalt wat de hele veeg doet. Zonder
      // dat zou je bij het terugvegen over je eigen selectie afwisselend
      // aanduiden en wissen, en dan flikkert de week onder je vinger.
      stroke.current = { turnOn: !cellsRef.current.has(key), touched: new Set() };
      apply(event.clientX, event.clientY);
    }

    function onMove(event: PointerEvent) {
      if (!stroke.current) return;
      event.preventDefault();
      apply(event.clientX, event.clientY);
    }

    function onUp() {
      const current = stroke.current;
      stroke.current = null;
      if (!current || current.touched.size === 0) return;
      // Per aangeraakte dag één keer opslaan, met de vakjes van ná deze veeg.
      // Niet per vakje: dan stuur je twintig verzoeken voor één veeg.
      for (const dayIso of current.touched) save(dayIso, cellsRef.current);
    }

    node.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // `cells` staat er bewust niet bij: de gebaren lezen `cellsRef`, en opnieuw
    // ophangen bij elk vakje zou de luisteraars midden in een veeg vervangen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  const todayKey = dayKeyFormatter.format(new Date());
  const total = cells.size;

  return (
    <section ref={shell} className="paint-screen">
      {/* De balk bovenaan vervangt de sitekop, de paginakop en de
          weeknavigatie: samen namen die ruim driehonderd pixels, en die had het
          raster nodig. */}
      <header className="paint-bar">
        <Link href={backHref} className="paint-icon-button" aria-label="Terug naar mijn ritten">
          <LogisticsIcon name="close" className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-vtk-ink">{weekLabel}</p>
          {/* Kort genoeg om niet af te kappen in de smalle middenkolom. */}
          <p className="truncate text-[11px] text-vtk-muted">
            Veeg om aan te duiden of te wissen.
          </p>
        </div>
        <Link href={previousHref} className="paint-icon-button" aria-label="Vorige week">
          <span aria-hidden>←</span>
        </Link>
        <Link href={nextHref} className="paint-icon-button" aria-label="Volgende week">
          <span aria-hidden>→</span>
        </Link>
      </header>

      <div className="paint-body">
        {/* De dagkoppen, op dezelfde kolommen als het raster eronder. */}
        <div
          className="grid pb-1"
          style={{
            gap: ROW_GAP_PX,
            gridTemplateColumns: `2.25rem repeat(${parsedDays.length}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {parsedDays.map((day) => {
            const isToday = dayKeyFormatter.format(day) === todayKey;
            return (
              // Op één regel: elke regel hier is een rij vakjes minder.
              <span
                key={day.toISOString()}
                className={`truncate text-center text-[11px] font-semibold capitalize ${
                  isToday ? 'text-vtk-navy' : 'text-vtk-muted'
                }`}
              >
                {weekdayFormatter.format(day)}{' '}
                <span className="font-normal tabular-nums">{dayNumberFormatter.format(day)}</span>
              </span>
            );
          })}
        </div>

        {/* `touch-action: none`: anders scrolt de pagina mee met je veeg en wordt
            er niets aangeduid. De pagina scrolt nog gewoon buiten dit raster. */}
        {/* De rijen delen wat er overblijft. Geen ondergrens en wel een
            `overflow: hidden` op de doos eromheen: met een ondergrens puilde het
            raster eruit zodra het niet paste, en dan viel de voetregel over de
            vakjes. Liever een rij van twintig pixels dan een scherm dat lekt. */}
        <div
          ref={grid}
          className="grid min-h-0 flex-1 touch-none select-none overflow-hidden"
          style={{
            gap: ROW_GAP_PX,
            gridTemplateRows: `repeat(${hours.length}, minmax(0, 1fr))`,
          }}
        >
          {hours.map((hour) => (
            <div
              key={hour}
              className="grid items-stretch"
              style={{
                gap: ROW_GAP_PX,
                gridTemplateColumns: `2.25rem repeat(${parsedDays.length}, minmax(0, 1fr))`,
              }}
            >
              <span className="self-center text-right text-[10px] tabular-nums text-vtk-muted">
                {String(hour).padStart(2, '0')}
              </span>
              {parsedDays.map((day) => {
                const iso = day.toISOString();
                const on = cells.has(cellKey(iso, hour));
                return (
                  <button
                    key={iso}
                    type="button"
                    data-day={iso}
                    data-hour={hour}
                    aria-pressed={on}
                    className={`h-full rounded-[6px] border transition-colors ${
                      on
                        ? 'border-vtk-navy/25 bg-vtk-yellow'
                        : 'border-vtk-navy/10 bg-vtk-paper/70'
                    }`}
                  >
                    <span className="sr-only">
                      {weekdayFormatter.format(day)} {dayNumberFormatter.format(day)} om{' '}
                      {String(hour).padStart(2, '0')}:00
                      {on ? ', aangeduid' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div ref={footer} className="paint-foot">
        <button
          type="button"
          onClick={() => setShowNight((value) => !value)}
          className="rounded-full border border-vtk-navy/20 px-2.5 py-1 text-xs font-medium text-vtk-muted transition hover:border-vtk-navy/50"
        >
          {showNight ? 'Nacht verbergen' : 'Ook 00:00 tot 06:00 tonen'}
        </button>
        <p className="text-xs text-vtk-muted">
          {total === 0 ? 'Nog niets aangeduid' : `${total} uur aangeduid deze week`}
        </p>
      </div>
    </section>
  );
}
