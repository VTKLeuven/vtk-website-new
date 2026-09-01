'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { driverColorVar, type DriverColorOverrides } from '@/lib/driver-colors';
import { minutesOfDay, placeForDay, startOfBrusselsDay, type Placed } from '@/lib/week-lanes';
import { BlockContent, blockLabel, blockLook, formatTime } from './trip-block';
import {
  DAY_HOURS,
  ZOOM_MIN,
  hourPxFor,
  type AvailabilityBand,
  type CalendarVehicle,
  type TripBlock,
} from './types';

/**
 * De dag- en weekweergave: de uren verticaal, de dagen naast elkaar, en elke rit
 * als een blok op zijn eigen moment.
 *
 * Wat het niet is: een raster per voertuig. Dat waren zeven losse rasters onder
 * elkaar, waarin "wat gebeurt er donderdag" pas te zien was na scrollen tot de
 * vierde. Het voertuig is daarom van kolom naar blok verhuisd (T7).
 *
 * Ritten die elkaar overlappen komen naast elkaar te staan, ook wanneer het om
 * verschillende voertuigen gaat: anders verbergt de auto de kar op precies het
 * moment waarop je wil zien dat er twee dingen tegelijk rijden.
 *
 * **Het is een echte agenda-pane en geen stuk pagina.** Drie dingen maken dat
 * verschil, en alle drie ontbraken in de eerste versie:
 *
 * 1. **Een eigen scroller met een echte hoogte.** De uren scrollen bínnen de
 *    kalender; de dagkop plakt bovenaan en de urenkolom links, zodat je nooit
 *    kwijt bent welke dag of welk uur je bekijkt. Voordien scrolde de hele
 *    pagina en verdween de dagkop naar boven.
 * 2. **De hele dag, 00:00 tot 24:00.** Het venster hing vroeger aan de data
 *    (07:00-23:00, opgerekt door de ritten), en dan verspringt de kalender van
 *    week tot week en valt er niets te vullen. Nu staat de dag er altijd
 *    volledig, en scrollt hij bij het openen naar het eerste dat er staat.
 * 3. **Zoom 1 = de hele dag past exact.** De uurhoogte volgt uit de hoogte van
 *    de pane (`fitHourPx`), dus in volledig scherm wordt een uur vanzelf hoger
 *    en vúlt de kalender het scherm. Zie `types.ts` voor het waarom.
 */

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
  month: 'short',
});
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Minimale breedte van een dagkolom.
 *
 * Zo gekozen dat een hele week nog net in de beheerkolom past op een laptop:
 * zeven maal deze breedte plus de urenkolom blijft onder de ~900px die daar
 * overblijft naast de zijbalk. Op 9,5rem viel zondag standaard buiten beeld, en
 * een weekweergave waarin je het weekend moet gaan zoeken is geen weekweergave.
 *
 * Breder zou beter zijn voor een blok dat bij overlap in tweeën of drieën
 * deelt, maar dat blok toont dan toch enkel zijn beginuur (zie
 * `docs/design-decisions.md`); wie de rest wil lezen, klikt hem open. Past de
 * week alsnog niet, dan schuift ze horizontaal; op een telefoon is dat precies
 * het gedrag dat je wil, want dan veeg je van dag naar dag in plaats van zeven
 * onleesbare kolommen te zien.
 *
 * Als variabele zodat `app/globals.css` ze op een smal scherm kan bijstellen
 * zonder dat dit bestand van de schermbreedte moet weten.
 */
const DAY_MIN_WIDTH = 'var(--tg-day-min, 7rem)';

/**
 * Het kolommenraster van de kalender: de urenkolom plus één kolom per dag.
 *
 * Geëxporteerd omdat de evenementenstrook erboven exact moet uitlijnen met de
 * dagkolommen eronder; een tweede raster met dezelfde bedoeling schuift bij de
 * eerste wijziging een halve kolom op.
 */
export function timeGridColumns(dayCount: number): string {
  return `3.25rem repeat(${dayCount}, minmax(${DAY_MIN_WIDTH}, 1fr))`;
}

/**
 * De stap waarop slepen vastklikt. Hetzelfde kwartier als de server aanvaardt
 * (`isOnQuarterHour`): kon je fijner slepen, dan bouwde je een rit die bij het
 * opslaan geweigerd wordt.
 */
const SNAP_MINUTES = 15;

/** Hoeveel pixels aan de onderrand van een blok het einduur verslepen in plaats van het blok. */
const RESIZE_GRIP_PX = 8;

/**
 * Hoeveel je moet bewegen voor een klik een sleep wordt. Zonder deze drempel
 * verschuift elke aanklik de rit een kwartier, want een muisklik beweegt altijd
 * een paar pixels.
 */
const DRAG_THRESHOLD_PX = 4;

/** Minuten sinds middernacht omzetten naar een moment op deze Belgische dag. */
function momentOn(day: Date, minutes: number): Date {
  return new Date(startOfBrusselsDay(day) + minutes * 60_000);
}

function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/** De verticale padding van een element; gaat van de bruikbare hoogte af. */
function paddingOf(node: HTMLElement): number {
  const style = getComputedStyle(node);
  return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
}

type DragState =
  | { kind: 'move'; blockId: string; dayIndex: number; from: number; to: number; grabOffset: number }
  | { kind: 'resize'; blockId: string; dayIndex: number; from: number; to: number }
  | { kind: 'create'; dayIndex: number; from: number; to: number };

export function TimeGrid({
  days,
  vehicles,
  blocks,
  onSelect,
  selectedId,
  emptyLabel,
  showDriver = true,
  driverColors,
  zoom = ZOOM_MIN,
  onMetrics,
  scrollerRef,
  now,
  onMoveBlock,
  onCreateRange,
  above,
  bands,
}: {
  /** De dagen, als ISO-strings van UTC-middernacht (date-only). */
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  /** Klikbaar maken; zonder deze functie is de kalender om naar te kijken. */
  onSelect?: (blockId: string) => void;
  selectedId?: string | null;
  emptyLabel: string;
  /** Uit op het publieke overzicht zonder login: daar is er geen chauffeur om te tonen. */
  showDriver?: boolean;
  /** Kleuren die het team zelf zette (K1); de rest volgt uit de id. */
  driverColors?: DriverColorOverrides;
  /** Zoomfactor; 1 = de hele dag past exact in de pane. Zie `types.ts`. */
  zoom?: number;
  /**
   * De gemeten maten van de pane. De werkbalk heeft ze nodig om bij het zoomen
   * het uur onder de muis vast te houden: `fitHourPx` om uren in pixels om te
   * rekenen, `headHeight` omdat de dag pas ónder de vastgeplakte kop begint.
   */
  onMetrics?: (metrics: { fitHourPx: number; headHeight: number }) => void;
  /** De scroller, zodat de werkbalk er ankerend in kan zoomen. */
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
  /** Nu-lijn; weglaten laat ze weg (bv. in een test of een afdruk). */
  now?: Date;
  /**
   * Een rit verslepen of aan de onderrand rekken (P4). Weglaten maakt de
   * kalender onbeweeglijk, wat het publieke overzicht ook is.
   */
  onMoveBlock?: (blockId: string, startAt: Date, endAt: Date) => void;
  /** Slepen op lege ruimte: een nieuwe rit op dat moment. */
  onCreateRange?: (startAt: Date, endAt: Date) => void;
  /**
   * Wat er boven de dagkoppen komt (de evenementenstrook, P5). Binnen dezelfde
   * scroller, zodat het meeschuift met de dagen eronder.
   */
  above?: ReactNode;
  /** Beschikbaarheidsvensters als lichte band achter het rooster (V1). */
  bands?: AvailabilityBand[];
}) {
  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles]
  );

  const placedPerDay = useMemo(
    () => parsedDays.map((day) => placeForDay(blocks, day)),
    [blocks, parsedDays]
  );

  // Dezelfde dagknip als de ritten, zodat een venster van 22:00 tot 02:00 ook op
  // twee dagen staat en niet op één met een negatieve hoogte.
  const bandsPerDay = useMemo(
    () => parsedDays.map((day) => (bands ? placeForDay(bands, day) : [])),
    [bands, parsedDays]
  );

  // De kalender toont altijd de hele dag; het eerste uur is dus 0. Een variabele
  // die overal in de berekeningen meeloopt, is er niet meer, maar de naam blijft
  // omdat de blokken hem als nulpunt gebruiken.
  const firstHour = 0;
  const lastHour = DAY_HOURS;

  /**
   * De uurhoogte waarbij de hele dag precies in de pane past, gemeten aan de
   * scroller zelf. Een `ResizeObserver` en geen `window.resize`: de pane
   * verandert ook van hoogte wanneer de evenementenstrook groeit of wanneer je
   * in volledig scherm gaat, en daar komt geen vensterwijziging aan te pas.
   */
  const innerScroller = useRef<HTMLDivElement | null>(null);
  const scroller = scrollerRef ?? innerScroller;
  const head = useRef<HTMLDivElement | null>(null);
  const [paneHeight, setPaneHeight] = useState(0);
  const [headHeight, setHeadHeight] = useState(0);

  useEffect(() => {
    const node = scroller.current;
    const headNode = head.current;
    if (!node || !headNode) return;
    // Twee dozen in één observer: de pane bepaalt hoeveel er is, de kop hoeveel
    // daarvan al bezet is. De kop verandert van hoogte wanneer de
    // evenementenstrook groeit, en dan hoort de dag mee te krimpen.
    // `contentRect` en niet `clientHeight`: die eerste is de contentbox en laat
    // de padding van de scroller buiten beschouwing. Met `clientHeight` bleef er
    // precies die padding aan scrollhoogte over, en dus een scrollbalk van 16
    // pixels bij "hele dag".
    const measure = () => {
      setPaneHeight(node.getBoundingClientRect().height - paddingOf(node));
      setHeadHeight(headNode.offsetHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(headNode);
    measure();
    return () => observer.disconnect();
  }, [scroller]);

  /**
   * De uurhoogte waarbij de hele dag precies past.
   *
   * De kop gaat eraf: die plakt bovenaan de scroller en bedekt dus het eerste
   * stuk van de dag. Zonder die aftrek bleef er bij "hele dag" altijd net een
   * scrollbalk over ter grootte van de dagkop, en dat is precies het soort
   * bijna-goed waar je naar blijft kijken.
   */
  const usable = Math.max(0, (paneHeight || 640) - headHeight);
  const fitHourPx = usable / DAY_HOURS;
  const hourPx = hourPxFor(fitHourPx, zoom);

  useEffect(() => {
    if (paneHeight > 0) onMetrics?.({ fitHourPx, headHeight });
  }, [fitHourPx, headHeight, onMetrics, paneHeight]);

  /**
   * Bij het openen naar het eerste dat er staat, met een uur marge; anders kijk
   * je elke keer eerst naar een lege nacht. Enkel wanneer er iets te scrollen
   * valt, en enkel bij een nieuwe dagenreeks: tijdens het zoomen houdt de
   * werkbalk het anker vast, en dan mag dit er niet overheen springen.
   */
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    const node = scroller.current;
    if (!node || paneHeight === 0) return;
    const key = days.join('|');
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;

    let earliest = 8 * 60;
    for (const day of placedPerDay) {
      for (const block of day) earliest = Math.min(earliest, block.from);
    }
    const target = Math.max(0, (earliest / 60 - 1) * hourPx);
    node.scrollTop = Math.min(target, Math.max(0, node.scrollHeight - node.clientHeight));
  }, [days, hourPx, paneHeight, placedPerDay, scroller]);

  /**
   * Wat er op dit moment versleept wordt.
   *
   * Enkel met een muis: op een touchscreen is verticaal vegen scrollen, en een
   * kalender die daarbij ritten verschuift, is onbruikbaar. Daar doet de
   * inspector het werk, met exacte uren in plaats van een gok.
   */
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const columns_ = useRef<Array<HTMLDivElement | null>>([]);
  /** Is er al voorbij de drempel bewogen? Zolang niet, is dit een klik. */
  const moved = useRef(false);
  const grabbedAtY = useRef(0);
  /**
   * De rit die net versleept is. Het loslaten van een sleep is óók een klik, en
   * die mag het paneel niet openen bovenop de week waarin je aan het schuiven
   * was. Per id en niet als vlag, want een vlag die pas bij de volgende
   * pointerdown gewist wordt, slikt ook de eerstvolgende klik op een rit die
   * helemaal niet versleepbaar is.
   */
  const justDraggedId = useRef<string | null>(null);

  /** Het uur onder de muis in deze dagkolom, in minuten sinds middernacht. */
  const minutesAt = useCallback(
    (dayIndex: number, clientY: number): number => {
      const node = columns_.current[dayIndex];
      if (!node) return firstHour * 60;
      const rect = node.getBoundingClientRect();
      const ratio = (clientY - rect.top) / Math.max(1, rect.height);
      const total = (lastHour - firstHour) * 60;
      return firstHour * 60 + Math.min(total, Math.max(0, ratio * total));
    },
    [firstHour, lastHour]
  );

  /**
   * Het slepen zelf hangt aan het venster en niet aan het blok: je muis verlaat
   * het blok zodra je begint te bewegen, en dan zou de sleep meteen stoppen.
   *
   * De luisteraars worden meteen bij het indrukken opgehangen en niet in een
   * effect. Een effect loopt pas ná de render die op `setDrag` volgt, en alles
   * wat je in die tussentijd beweegt, is weg; bij een snelle sleep sprong de rit
   * daardoor naar het verkeerde uur.
   */
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const listen = useCallback(() => {
    function onMove(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      // Een muisklik beweegt altijd een paar pixels; zonder drempel verschuift
      // elke aanklik de rit een kwartier.
      if (!moved.current) {
        if (Math.abs(event.clientY - grabbedAtY.current) < DRAG_THRESHOLD_PX) return;
        moved.current = true;
      }
      const minutes = snap(minutesAt(current.dayIndex, event.clientY));
      if (current.kind === 'resize') {
        dragRef.current = { ...current, to: Math.max(current.from + SNAP_MINUTES, minutes) };
      } else if (current.kind === 'create') {
        dragRef.current = { ...current, to: minutes };
      } else {
        const length = current.to - current.from;
        const from = Math.max(0, minutes - current.grabOffset);
        dragRef.current = { ...current, from, to: from + length };
      }
      setDrag(dragRef.current);
    }

    function onUp() {
      detach();
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current || !moved.current) return;
      if (current.kind !== 'create') justDraggedId.current = current.blockId;
      const day = parsedDays[current.dayIndex];
      const from = Math.min(current.from, current.to);
      const to = Math.max(current.from, current.to);
      if (to - from < SNAP_MINUTES) return;
      if (current.kind === 'create') {
        onCreateRange?.(momentOn(day, from), momentOn(day, to));
      } else {
        onMoveBlock?.(current.blockId, momentOn(day, from), momentOn(day, to));
      }
    }

    function detach() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      stopDrag.current = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    stopDrag.current = detach;
  }, [minutesAt, onCreateRange, onMoveBlock, parsedDays]);

  function beginBlockDrag(
    event: React.PointerEvent,
    block: Placed<TripBlock>,
    dayIndex: number,
    kind: 'move' | 'resize'
  ) {
    if (!onMoveBlock || event.pointerType !== 'mouse' || event.button !== 0) return;
    // Een rit die over de dagrand loopt, versleep je niet vanuit deze dag: het
    // stuk dat je ziet is niet de hele rit, en verschuiven zou het andere stuk
    // laten verspringen zonder dat je het ziet.
    if (block.continuesBefore || block.continuesAfter) return;
    event.stopPropagation();
    moved.current = false;
    grabbedAtY.current = event.clientY;
    const at = snap(minutesAt(dayIndex, event.clientY));
    const next: DragState =
      kind === 'resize'
        ? { kind, blockId: block.id, dayIndex, from: block.from, to: block.to }
        : {
            kind,
            blockId: block.id,
            dayIndex,
            from: block.from,
            to: block.to,
            grabOffset: at - block.from,
          };
    dragRef.current = next;
    setDrag(next);
    listen();
  }

  function beginCreate(event: React.PointerEvent, dayIndex: number) {
    if (!onCreateRange || event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    moved.current = false;
    grabbedAtY.current = event.clientY;
    const at = snap(minutesAt(dayIndex, event.clientY));
    const next: DragState = { kind: 'create', dayIndex, from: at, to: at + 60 };
    dragRef.current = next;
    setDrag(next);
    listen();
  }

  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  const height = hours.length * hourPx;
  const columns = timeGridColumns(parsedDays.length);

  const todayKey = now ? dayKeyFormatter.format(now) : null;
  const nowMinutes = now ? minutesOfDay(now) : 0;

  // Het rooster blijft staan wanneer er niets is. Vroeger kwam er één zin in de
  // plaats, en dat was een kalender die verdween precies op de dag waarop je er
  // een rit op wil tekenen. De zin staat nu in de kop, boven een leeg maar
  // bruikbaar raster.

  return (
    // De pane: één doos met een echte hoogte waarin verticaal én horizontaal
    // gescrold wordt. `relative` omdat een `sr-only` binnenin absoluut
    // gepositioneerd is en zonder dit op de pagina ankert in plaats van op het
    // raster; dat liet een telefoon het hele scherm uitzoomen om dat ene
    // onzichtbare pixel te tonen.
    <div className="tg-pane relative rounded-[16px] border border-vtk-navy/10 bg-vtk-surface">
      <div ref={scroller} className="tg-scroller relative h-full overflow-auto p-2">
        {/* De kop plakt bovenaan de scroller: de dagen en de evenementenstrook
            blijven staan terwijl je door de uren scrolt. Eén `sticky` blok en
            niet twee, want twee sticky elementen met een eigen `top` schuiven
            over elkaar zodra de strook van hoogte verandert. */}
        <div ref={head} className="tg-head sticky top-0 z-30 bg-vtk-surface pb-1.5">
          {above}

          {blocks.length === 0 ? (
            <p className="px-1 pb-1 text-sm text-vtk-muted">{emptyLabel}</p>
          ) : null}

          <div className="grid gap-1" style={{ gridTemplateColumns: columns }}>
            <span className="sticky left-0 z-20 bg-vtk-surface" />
            {parsedDays.map((day, index) => {
              const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
              return (
                <span
                  key={days[index]}
                  className={`truncate px-1 text-xs ${isToday ? 'text-vtk-navy' : 'text-vtk-muted'}`}
                >
                  <span
                    className={`font-semibold capitalize ${isToday ? 'text-vtk-navy' : 'text-vtk-ink'}`}
                  >
                    {weekdayFormatter.format(day)}
                  </span>{' '}
                  {dayNumberFormatter.format(day)}
                </span>
              );
            })}
          </div>
        </div>

        <div className="grid gap-1" style={{ gridTemplateColumns: columns }}>
          {/* De urenkolom, vastgeplakt links: scrol je horizontaal door de week,
              dan blijft de klok staan waar ze hoort. */}
          <div className="sticky left-0 z-20 bg-vtk-surface" style={{ height }}>
            <div className="relative h-full">
              {hours.map((hour, index) => (
                <span
                  key={hour}
                  className={`absolute right-1 text-[11px] tabular-nums text-vtk-muted ${
                    // 00:00 staat op de bovenrand; die half omhoog schuiven zou
                    // hem onder de dagkop duwen. De rest hangt wél gecentreerd
                    // op zijn lijn.
                    index === 0 ? '' : '-translate-y-1/2'
                  }`}
                  style={{ top: index * hourPx }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>

          {parsedDays.map((day, dayIndex) => {
            const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
            return (
              <div
                key={days[dayIndex]}
                ref={(node) => {
                  columns_.current[dayIndex] = node;
                }}
                onPointerDown={(event) => beginCreate(event, dayIndex)}
                className={`tg-day relative rounded-[10px] ${isToday ? 'bg-vtk-yellow/10' : 'bg-vtk-paper/70'} ${
                  onCreateRange ? 'cursor-copy' : ''
                }`}
                style={{ height }}
              >
                {/* Uurlijnen, zodat je een blok op de klok kan leggen. */}
                {hours.map((hour, index) => (
                  <span
                    key={hour}
                    className="absolute inset-x-0 border-t border-vtk-navy/10"
                    style={{ top: index * hourPx }}
                    aria-hidden
                  />
                ))}

                {/* De beschikbaarheid van de chauffeurs (V1), helemaal onderaan
                    de stapel: het is context waarbinnen je plant, geen afspraak
                    die met een rit kan concurreren om je aandacht. */}
                {bandsPerDay[dayIndex].map((band) => (
                  <span
                    key={`${band.id}-${days[dayIndex]}`}
                    aria-hidden
                    title={`${band.driverName} kan rijden${band.note ? `: ${band.note}` : ''}`}
                    className="pointer-events-none absolute inset-x-0 rounded-[6px] opacity-30"
                    style={{
                      top: ((band.from - firstHour * 60) / 60) * hourPx,
                      height: Math.max(4, ((band.to - band.from) / 60) * hourPx),
                      backgroundColor: driverColorVar(band.driverId, driverColors),
                    }}
                  />
                ))}

                {/* Waar we nu staan. Enkel op vandaag, en enkel wanneer dat uur
                    ook getekend wordt: buiten het venster zou de lijn tegen de
                    boven- of onderrand plakken en een uur beweren dat er niet is. */}
                {isToday && nowMinutes >= firstHour * 60 && nowMinutes <= lastHour * 60 ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{ top: ((nowMinutes - firstHour * 60) / 60) * hourPx }}
                  />
                ) : null}

                {/* Het blok dat je nu tekent of versleept, als schaduw op zijn
                    nieuwe plek. Zonder dit zie je pas na het loslaten waar de rit
                    terechtkomt, en dan is het al gebeurd. */}
                {drag && drag.dayIndex === dayIndex && moved.current ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-20 rounded-[8px] border-2 border-dashed border-vtk-navy bg-vtk-navy/10 px-1.5 py-1 text-[11px] font-semibold tabular-nums text-vtk-navy"
                    style={{
                      top: ((Math.min(drag.from, drag.to) - firstHour * 60) / 60) * hourPx,
                      height: Math.max(
                        18,
                        (Math.abs(drag.to - drag.from) / 60) * hourPx - 2
                      ),
                    }}
                  >
                    {formatTime(momentOn(day, Math.min(drag.from, drag.to)))}
                    {'-'}
                    {formatTime(momentOn(day, Math.max(drag.from, drag.to)))}
                  </div>
                ) : null}

                {placedPerDay[dayIndex].map((block) => (
                  <TimeBlock
                    key={`${block.id}-${days[dayIndex]}`}
                    block={block}
                    vehicle={vehicleById.get(block.vehicleId) ?? null}
                    firstHour={firstHour}
                    hourPx={hourPx}
                    onSelect={onSelect}
                    selected={selectedId === block.id}
                    showDriver={showDriver}
                    driverColors={driverColors}
                    draggable={Boolean(onMoveBlock)}
                    dimmed={drag?.kind !== 'create' && drag?.blockId === block.id && moved.current}
                    onDragStart={(event, kind) => beginBlockDrag(event, block, dayIndex, kind)}
                    justDragged={() => {
                      if (justDraggedId.current !== block.id) return false;
                      justDraggedId.current = null;
                      return true;
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimeBlock({
  block,
  vehicle,
  firstHour,
  hourPx,
  onSelect,
  selected,
  showDriver,
  driverColors,
  draggable,
  dimmed,
  onDragStart,
  justDragged,
}: {
  block: Placed<TripBlock>;
  vehicle: CalendarVehicle | null;
  firstHour: number;
  hourPx: number;
  onSelect?: (blockId: string) => void;
  selected: boolean;
  showDriver: boolean;
  driverColors?: DriverColorOverrides;
  draggable?: boolean;
  /** Dit blok wordt op dit moment versleept; de schaduw toont waar het heen gaat. */
  dimmed?: boolean;
  onDragStart?: (event: React.PointerEvent, kind: 'move' | 'resize') => void;
  /** Is er net gesleept? Dan is deze klik het loslaten en geen selectie. */
  justDragged?: () => boolean;
}) {
  const top = ((block.from - firstHour * 60) / 60) * hourPx;
  const rawHeight = ((block.to - block.from) / 60) * hourPx;
  const laneWidth = 100 / block.lanes;
  const look = blockLook({ block, vehicle, showDriver, driverColors, selected });

  const style: React.CSSProperties = {
    ...look.style,
    top: Math.max(0, top),
    // Minimaal 24px: een kwartierrit moet aanklikbaar blijven, ook uitgezoomd.
    height: Math.max(24, rawHeight - 2),
    left: `${block.lane * laneWidth}%`,
    width: `${laneWidth}%`,
    opacity: dimmed ? 0.4 : look.style.opacity,
  };

  // Staat dit blok naast een ander, dan is er geen plaats voor een heel bereik.
  // Het einduur is dan af te lezen aan de onderrand tegen de urenlijnen, en het
  // staat voluit in de tooltip; een afgekapt "08:0…" zegt niets.
  const label = blockLabel({
    block,
    vehicle,
    showDriver,
    awaitsDriver: look.awaitsDriver,
    start: block.start,
    end: block.end,
  });
  const content: ReactNode = (
    <BlockContent
      block={block}
      vehicle={vehicle}
      showDriver={showDriver}
      awaitsDriver={look.awaitsDriver}
      start={block.start}
      end={block.end}
      continuesBefore={block.continuesBefore}
      continuesAfter={block.continuesAfter}
      compact={block.lanes > 1}
    />
  );

  if (!onSelect) {
    return (
      <div className={`absolute ${look.className}`} style={style} title={label}>
        {content}
      </div>
    );
  }

  // Enkel een rit die volledig op deze dag valt, is te verslepen: van een rit
  // die over middernacht loopt zie je hier maar de helft.
  const movable = draggable && !block.continuesBefore && !block.continuesAfter;

  return (
    <button
      type="button"
      // `onSelect` en niet openen wanneer je net gesleept hebt: het loslaten van
      // een sleep is óók een klik, en dan sprong het paneel open bovenop de week
      // waarin je aan het schuiven was.
      onClick={(event) => {
        if (justDragged?.()) {
          event.preventDefault();
          return;
        }
        onSelect(block.id);
      }}
      onPointerDown={movable ? (event) => onDragStart?.(event, 'move') : undefined}
      className={`absolute transition hover:brightness-95 ${movable ? 'cursor-grab' : ''} ${look.className}`}
      style={style}
      title={label}
      aria-label={label}
    >
      {content}
      {/* De greep aan de onderrand rekt het einduur op. Een eigen strookje en
          niet de rand van het blok zelf: die randen liggen bij overlap tegen
          elkaar, en dan pak je de verkeerde rit vast. */}
      {movable ? (
        <span
          aria-hidden
          onPointerDown={(event) => onDragStart?.(event, 'resize')}
          className="absolute inset-x-0 bottom-0 cursor-ns-resize"
          style={{ height: RESIZE_GRIP_PX }}
        />
      ) : null}
    </button>
  );
}
