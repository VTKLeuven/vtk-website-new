'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { setAvailabilityDayAction } from '@/app/actions/uitleen';
import { LogisticsIcon } from '@/components/logistics-icon';
import { useToast } from '@/components/ui/toast';
import {
  AVAILABILITY_KINDS,
  availabilityDayBounds,
  cellsForDay,
  clockHourOfCell,
  DAG_START_UUR,
  type AvailabilityKind,
} from '@/lib/availability-day';
import {
  AVAILABILITY_KIND_LABEL,
  AVAILABILITY_KIND_SHORT,
  availabilityFillClass,
} from '@/lib/availability-kinds';
import { AvailabilityNote } from './availability-note';
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
 * - **Een penseel boven het raster.** Je kiest eerst wát je aanduidt
 *   (beschikbaar, liever niet, in noodgeval, of wissen) en veegt dan. De soort
 *   per vakje laten doorklikken was het alternatief, maar dan is een week
 *   doorgeven vier keer over hetzelfde vakje tikken; met een penseel blijft het
 *   één veeg per soort.
 * - **Per uur en niet per kwartier.** Met een vinger mik je geen kwartier. Wie
 *   het precies wil, gebruikt de twee velden eronder of een computer.
 * - **`touch-action: none` op het raster.** Anders scrolt de pagina mee met je
 *   veeg en wordt er niets aangeduid. De pagina blijft scrollen buiten het
 *   raster, en het raster zelf past altijd op één scherm.
 * - **Een dag loopt van 05:00 tot 05:00** (F4.2). De kolom van zaterdag eindigt
 *   dus op de uren 00 tot 04 van zondagochtend, met een streepje op de
 *   middernachtgrens. Wie tot twee uur rijdt, duidt dat aan onder de avond
 *   waarbij het hoort, in dezelfde veeg.
 * - **Alle vierentwintig rijen staan er.** De nacht stond ingeklapt achter een
 *   knop omdat er van 00:00 tot 06:00 zelden iemand rijdt, maar dat is precies
 *   wat deze mensen wél doen, en na het opschuiven van de dagrand zou die knop
 *   net de uren verbergen waarvoor ze kwamen. De rijen delen de hoogte, dus dit
 *   kost geen scherm; enkel een paar pixels per rij.
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

/** De vakjes van één dag: vierentwintig, vanaf `DAG_START_UUR`. */
const CELLS = Array.from({ length: 24 }, (_, index) => index);

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
  weekValue,
  note,
  previousHref,
  nextHref,
  backHref,
}: {
  /** De week, als ISO-strings van UTC-middernacht. */
  days: string[];
  windows: AvailabilityWindow[];
  /** "Week 36": wat er in de balk bovenaan staat. */
  weekLabel: string;
  /** De maandag als `YYYY-MM-DD`, voor de weeknota. */
  weekValue: string;
  /** De algemene nota van deze week (F4.5), of een lege string. */
  note: string;
  previousHref: string;
  nextHref: string;
  /** Terug naar waar dit scherm vandaan komt. */
  backHref: string;
}) {
  const showToast = useToast();
  const [, startTransition] = useTransition();
  /**
   * Wat een veeg neerzet. `null` wist.
   *
   * Standaard "beschikbaar": dat is het antwoord dat het vaakst gegeven wordt,
   * en wie enkel dat doet, hoeft van dit penseel niets te weten.
   */
  const [brush, setBrush] = useState<AvailabilityKind | null>('JA');

  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);

  /**
   * Het begin van elke dagkolom: 05:00 en niet middernacht (`DAG_START_UUR`).
   * Ook het moment waaruit een vakje zijn echte datum en uur krijgt, en dat is
   * voor de vakjes na middernacht de dag erna.
   */
  const dayStarts = useMemo(
    () => parsedDays.map((day) => availabilityDayBounds(day).dayStart),
    [parsedDays]
  );

  /** De vakjes zoals ze uit de opgeslagen vensters volgen, met hun soort. */
  const saved = useMemo(() => {
    const map = new Map<string, AvailabilityKind>();
    const parsed = windows.map((window) => ({
      startAt: new Date(window.startAt),
      endAt: new Date(window.endAt),
      kind: window.kind,
    }));
    for (const day of parsedDays) {
      const { dayStart, dayEnd } = availabilityDayBounds(day);
      const iso = day.toISOString();
      for (const [hour, kind] of cellsForDay(parsed, dayStart, dayEnd)) {
        map.set(cellKey(iso, hour), kind);
      }
    }
    return map;
  }, [parsedDays, windows]);

  /**
   * Wat er nú aanstaat, inclusief wat nog aan het opslaan is.
   *
   * Eigen state en geen `useOptimistic`: je veegt hier over tien vakjes na
   * elkaar, en die mogen niet één voor één terugspringen terwijl de server nog
   * bezig is. Bij nieuwe gegevens van de server nemen we die over.
   */
  const [cells, setCells] = useState<Map<string, AvailabilityKind>>(saved);
  /**
   * Dezelfde vakjes, maar leesbaar vanuit de aanraakluisteraars.
   *
   * Zonder deze ref moest het opslaan bij het loslaten de nieuwste state uit een
   * `setCells`-updater vissen, en dan draait de server-actie tijdens de render
   * ("Cannot call startTransition while rendering"). De ref is de waarheid voor
   * de gebaren, de state is er voor het tekenen.
   */
  const cellsRef = useRef(cells);
  const savedKey = useMemo(
    () => [...saved].map(([key, kind]) => `${key}=${kind}`).sort().join('|'),
    [saved]
  );
  const lastSavedKey = useRef(savedKey);
  useEffect(() => {
    if (lastSavedKey.current === savedKey) return;
    lastSavedKey.current = savedKey;
    cellsRef.current = saved;
    setCells(saved);
  }, [saved, savedKey]);

  /**
   * Het penseel, leesbaar vanuit de aanraakluisteraars. Om dezelfde reden als
   * `cellsRef`: die luisteraars hangen er één keer aan en mogen niet bij elke
   * pilklik vervangen worden.
   */
  const brushRef = useRef(brush);
  brushRef.current = brush;

  const grid = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  /** De veeg die bezig is: wat ze neerzet (`null` = wissen), en welke dagen ze raakte. */
  const stroke = useRef<{ paint: AvailabilityKind | null; touched: Set<string> } | null>(null);

  const save = useCallback(
    (dayIso: string, next: Map<string, AvailabilityKind>) => {
      const day = new Date(dayIso);
      const hoursOn: Array<{ hour: number; kind: AvailabilityKind }> = [];
      for (let hour = 0; hour < 24; hour += 1) {
        const kind = next.get(cellKey(dayIso, hour));
        if (kind) hoursOn.push({ hour, kind });
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
      if ((cellsRef.current.get(key) ?? null) === current.paint) return;
      const next = new Map(cellsRef.current);
      if (current.paint) next.set(key, current.paint);
      else next.delete(key);
      cellsRef.current = next;
      setCells(next);
    }

    function onDown(event: PointerEvent) {
      const at = cellAt(event.clientX, event.clientY);
      if (!at) return;
      event.preventDefault();
      const key = cellKey(at.dayIso, at.hour);
      // Het eerste vakje bepaalt wat de hele veeg doet: droeg het je penseel al,
      // dan wist deze veeg. Zonder die regel zou je bij het terugvegen over je
      // eigen selectie afwisselend aanduiden en wissen, en dan flikkert de week
      // onder je vinger. Het is meteen ook hoe je iets weghaalt zonder eerst
      // naar de wisknop te gaan.
      const paint = brushRef.current !== null && cellsRef.current.get(key) === brushRef.current
        ? null
        : brushRef.current;
      stroke.current = { paint, touched: new Set() };
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

  // Welke kolom "vandaag" is, volgt de verschoven dagrand: om 02:00 sta je nog
  // in de kolom van gisteren, want daar staat het vakje dat je dan aanduidt.
  const todayKey = dayKeyFormatter.format(new Date(Date.now() - DAG_START_UUR * HOUR_MS));
  /** Hoeveel uur je van elke soort aanduidde; nul soorten laten we weg. */
  const totals = AVAILABILITY_KINDS.map((kind) => ({
    kind,
    count: [...cells.values()].filter((value) => value === kind).length,
  })).filter((entry) => entry.count > 0);

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
          {/* Kort genoeg om niet af te kappen in de smalle middenkolom; wát je
              neerzet staat in de penseelrij eronder. */}
          <p className="truncate text-[11px] text-vtk-muted">Veeg over de uren.</p>
        </div>
        <Link href={previousHref} className="paint-icon-button" aria-label="Vorige week">
          <span aria-hidden>←</span>
        </Link>
        <Link href={nextHref} className="paint-icon-button" aria-label="Volgende week">
          <span aria-hidden>→</span>
        </Link>
      </header>

      {/* Kiezen wát je neerzet. De volgorde is die van het antwoord: eerst het
          gulste, dan het karigste, en wissen apart achteraan. */}
      <div className="paint-brush" role="group" aria-label="Wat duid je aan">
        {AVAILABILITY_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={brush === kind}
            onClick={() => setBrush(kind)}
            className="paint-brush-option"
          >
            <span aria-hidden className={`paint-brush-swatch ${availabilityFillClass(kind)}`} />
            {AVAILABILITY_KIND_SHORT[kind]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={brush === null}
          onClick={() => setBrush(null)}
          className="paint-brush-option"
        >
          <span aria-hidden className="paint-brush-swatch paint-brush-swatch-off" />
          Wissen
        </button>
      </div>

      {/* Eén regel voor wat over de hele week gaat (F4.5). */}
      <AvailabilityNote week={weekValue} initial={note} variant="paint" />

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
            gridTemplateRows: `repeat(${CELLS.length}, minmax(0, 1fr))`,
          }}
        >
          {CELLS.map((cell) => {
            const clock = clockHourOfCell(cell);
            return (
              <div
                key={cell}
                // Eén streepje op de middernachtgrens. Zonder dat springt de
                // urenkolom van 23 naar 00 zonder te zeggen dat je daar een dag
                // verder bent, en dan lijkt het een fout in plaats van de nacht
                // die bij deze avond hoort.
                className={`grid items-stretch ${
                  clock === 0 ? 'border-t border-dashed border-vtk-navy/30 pt-[2px]' : ''
                }`}
                style={{
                  gap: ROW_GAP_PX,
                  gridTemplateColumns: `2.25rem repeat(${parsedDays.length}, minmax(0, 1fr))`,
                }}
              >
                <span className="self-center text-right text-[10px] tabular-nums text-vtk-muted">
                  {String(clock).padStart(2, '0')}
                </span>
                {parsedDays.map((day, dayIndex) => {
                  const iso = day.toISOString();
                  const kind = cells.get(cellKey(iso, cell));
                  // Het echte moment van dit vakje, en dus de echte datum: een
                  // vakje na middernacht ligt op de dag ná de kolomkop.
                  const moment = new Date(dayStarts[dayIndex].getTime() + cell * HOUR_MS);
                  return (
                    <button
                      key={iso}
                      type="button"
                      data-day={iso}
                      data-hour={cell}
                      aria-pressed={Boolean(kind)}
                      className={`h-full rounded-[6px] border transition-colors ${
                        kind
                          ? `border-vtk-navy/25 bg-vtk-yellow ${availabilityFillClass(kind)}`
                          : 'border-vtk-navy/10 bg-vtk-paper/70'
                      }`}
                    >
                      <span className="sr-only">
                        {weekdayFormatter.format(moment)} {dayNumberFormatter.format(moment)} om{' '}
                        {String(clock).padStart(2, '0')}:00
                        {kind ? `, ${AVAILABILITY_KIND_LABEL[kind].toLowerCase()}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div ref={footer} className="paint-foot">
        {/* Waarom er onder zaterdag uren van zondagochtend staan. Eén regel,
            want het raster zegt het verder zelf. */}
        <p className="text-xs text-vtk-muted">De nacht hoort bij de avond ervoor.</p>
        {/* De telling per soort als staaltje plus uren, en niet uitgeschreven:
            "1u beschikbaar · 1u liever niet · 1u in noodgeval" nam twee regels
            en duwde de nachtknop weg. De pillen erboven zeggen al welk staaltje
            welke soort is. */}
        {totals.length === 0 ? (
          <p className="text-xs text-vtk-muted">Nog niets aangeduid</p>
        ) : (
          <p className="flex items-center gap-2.5 text-xs tabular-nums text-vtk-muted">
            {totals.map((entry) => (
              <span key={entry.kind} className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className={`h-3 w-3 rounded-[3px] border border-vtk-navy/25 bg-vtk-yellow ${availabilityFillClass(entry.kind)}`}
                />
                {entry.count}u
                <span className="sr-only"> {AVAILABILITY_KIND_LABEL[entry.kind].toLowerCase()}</span>
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
