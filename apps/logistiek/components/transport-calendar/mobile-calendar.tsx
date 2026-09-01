'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { driverColorVar } from '@/lib/driver-colors';
import { minutesOfDay, placeForDay, startOfBrusselsDay } from '@/lib/week-lanes';
import { LogisticsIcon } from '@/components/logistics-icon';
import type { CalendarEventBar } from './event-bars';
import { BlockContent, blockLabel, blockLook } from './trip-block';
import type { AvailabilityBand, CalendarVehicle, TripBlock } from './types';

/**
 * De transportplanning op een telefoon, in volledig scherm.
 *
 * **Een eigen weergave en niet de weekweergave die kleiner gezet is.** Dat laatste
 * is geprobeerd: zeven kolommen in 340 pixels werd tweeënhalve dag naast elkaar,
 * met een rit van 112px breed waarin "Career Fair" drie letters is, en je moest
 * horizontaal scrollen om te weten of er zaterdag iets stond. Een kalender op een
 * telefoon toont **één dag over de volle breedte**; dat is wat elke agenda-app op
 * een telefoon doet, en om dezelfde reden.
 *
 * Hoe je je erin beweegt:
 *
 * - **De dagstrip bovenaan** toont de zeven dagen van de week met een stip als er
 *   die dag iets staat. Aantikken springt naar die dag.
 * - **Vegen** gaat naar de vorige of de volgende dag. `touch-action: pan-y` op het
 *   rooster: verticaal vegen blijft dus gewoon scrollen (native, en dus vloeiend),
 *   en enkel de horizontale beweging komt bij ons terecht.
 * - **Knijpen** maakt de uren hoger of lager, met het uur tussen je vingers als
 *   ankerpunt.
 *
 * Wat er bewust **niet** in zit: slepen om een rit te verplaatsen of aan te maken.
 * Op een touchscreen is elke sleep ook een scroll, en een rit die per ongeluk
 * twee uur opschuift merk je pas als de chauffeur belt. Aantikken opent de rit;
 * aanpassen doe je daar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS = 24;

/** Comfortabele uurhoogte op een telefoon, en de grenzen waarbinnen knijpen mag. */
const DEFAULT_HOUR_PX = 56;
const MIN_HOUR_PX = 28;
const MAX_HOUR_PX = 200;

/** Hoe ver je horizontaal moet vegen voor het een dagwissel is. */
const SWIPE_PX = 56;

/** Breedte van de urenkolom. */
const GUTTER = 46;

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
});
const fullDayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function clampHourPx(value: number): number {
  return Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, value));
}

export function MobileCalendar({
  days,
  vehicles,
  blocks,
  events,
  bands,
  driverColors,
  showDriver = true,
  selectedId,
  onSelect,
  onSelectEvent,
  onClose,
  onCreate,
  onPrevRange,
  onNextRange,
  onToday,
  now,
}: {
  /** De dagen van het venster, als ISO-strings van UTC-middernacht. */
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  events?: CalendarEventBar[];
  bands?: AvailabilityBand[];
  driverColors?: DriverColorOverrides;
  showDriver?: boolean;
  selectedId?: string | null;
  onSelect?: (blockId: string) => void;
  onSelectEvent?: (eventId: string) => void;
  /** Volledig scherm verlaten. */
  onClose: () => void;
  /**
   * Een rit toevoegen op de dag die je bekijkt. Slepen om een moment te kiezen
   * kan hier niet (elke sleep op een touchscreen is ook een scroll), dus de knop
   * kiest het eerstvolgende hele uur en de rest doe je in het formulier.
   */
  onCreate?: (startAt: Date, endAt: Date) => void;
  /** Voorbij de eerste of laatste dag van het venster: een week terug of verder. */
  onPrevRange?: () => void;
  onNextRange?: () => void;
  onToday?: () => void;
  now?: Date;
}) {
  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles]
  );

  const todayKey = now ? dayKeyFormatter.format(now) : null;

  /**
   * Beginnen op vandaag als die in het venster zit, anders op de eerste dag. Op
   * maandag naar de planning gaan en op zondag uitkomen is geen begin.
   */
  const [index, setIndex] = useState(() => {
    if (!todayKey) return 0;
    const found = parsedDays.findIndex((day) => dayKeyFormatter.format(day) === todayKey);
    return found === -1 ? 0 : found;
  });
  const day = parsedDays[Math.min(index, parsedDays.length - 1)];

  const [hourPx, setHourPx] = useState(DEFAULT_HOUR_PX);
  const scroller = useRef<HTMLDivElement>(null);
  /** De uurhoogte die nu getekend staat; waarmee je `scrollTop` mag omrekenen. */
  const applied = useRef(hourPx);
  /** Het uur dat na deze render weer onder je vingers moet liggen. */
  const pendingAnchor = useRef<{ hours: number; offset: number } | null>(null);

  /**
   * Het knijpen afronden ná de render.
   *
   * Zonder dit schuift de dag onder je vingers weg terwijl je knijpt: de
   * scrollpositie is een pixelafstand, en die betekent bij een andere uurhoogte
   * een ander uur. In een layout-effect en niet in een `requestAnimationFrame`,
   * want dat laatste loopt niet gegarandeerd ná de commit en klemt de nieuwe
   * scrollpositie dan op de oude, kleinere inhoud.
   */
  useLayoutEffect(() => {
    applied.current = hourPx;
    const pending = pendingAnchor.current;
    pendingAnchor.current = null;
    const node = scroller.current;
    if (!pending || !node) return;
    const target = pending.hours * hourPx - pending.offset;
    node.scrollTop = Math.max(0, Math.min(target, node.scrollHeight - node.clientHeight));
  }, [hourPx]);

  const placed = useMemo(() => (day ? placeForDay(blocks, day) : []), [blocks, day]);
  const dayBands = useMemo(() => (day && bands ? placeForDay(bands, day) : []), [bands, day]);

  /** Hoeveel ritten er per dag staan, voor de stipjes in de dagstrip. */
  const perDay = useMemo(
    () => parsedDays.map((each) => placeForDay(blocks, each).length),
    [blocks, parsedDays]
  );

  /** De evenementen die deze dag raken. */
  const dayEvents = useMemo(() => {
    if (!events || !day) return [];
    const from = startOfBrusselsDay(day);
    const to = startOfBrusselsDay(new Date(day.getTime() + DAY_MS));
    return events.filter(
      (event) =>
        new Date(event.startAt).getTime() < to && new Date(event.endAt).getTime() > from
    );
  }, [day, events]);

  const goto = useCallback(
    (next: number) => {
      if (next < 0) {
        onPrevRange?.();
        return;
      }
      if (next > parsedDays.length - 1) {
        onNextRange?.();
        return;
      }
      setIndex(next);
    },
    [onNextRange, onPrevRange, parsedDays.length]
  );

  // Bij het openen en bij elke dagwissel naar het eerste dat er staat, minus een
  // half uur lucht; staat er niets, dan naar 08:00. Bovenaan beginnen betekent
  // vier uur nacht in beeld.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const earliest = placed.reduce(
      (soonest, block) => Math.min(soonest, block.from),
      Number.POSITIVE_INFINITY
    );
    const minutes = Number.isFinite(earliest) ? Math.max(0, earliest - 30) : 8 * 60;
    node.scrollTop = (minutes / 60) * hourPx;
    // Enkel bij een dagwissel, niet bij elke zoomstap: anders springt de dag
    // terug naar boven terwijl je aan het knijpen bent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, days.join('|')]);

  /**
   * Vegen en knijpen.
   *
   * Eén luisteraar voor allebei, want het is dezelfde vingerreeks: één vinger is
   * een veeg, twee vingers zijn een knijp. Native listeners met
   * `{ passive: false }`, want React hangt `onPointerMove` passief op en dan mag
   * `preventDefault()` niet.
   */
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    const points = new Map<number, { x: number; y: number }>();
    let swipe: { x: number; y: number; done: boolean } | null = null;
    let pinch: { distance: number; hourPx: number } | null = null;
    let frame = 0;

    /**
     * Het scrollen weer vrijgeven.
     *
     * Tijdens het knijpen staat `touch-action` op `none`, anders scrolt de doos
     * mee met het gebaar. Bleef die staan, dan kon je na een knijp niet meer
     * scrollen; dat gebeurde zodra één `pointerup` verloren ging (de browser
     * slikt er een bij zijn eigen gebaarherkenning). Daarom wordt dit ook bij
     * elke nieuwe eerste vinger opnieuw vrijgegeven: dan geneest het zichzelf.
     */
    function release() {
      if (node) node.style.touchAction = '';
    }

    function spread(): { distance: number; midY: number } | null {
      const [a, b] = [...points.values()];
      if (!a || !b) return null;
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), midY: (a.y + b.y) / 2 };
    }

    function onDown(event: PointerEvent) {
      if (event.pointerType === 'mouse') return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size === 1) {
        swipe = { x: event.clientX, y: event.clientY, done: false };
        pinch = null;
        release();
        return;
      }
      const spread_ = spread();
      if (points.size === 2 && spread_ && spread_.distance > 0 && node) {
        swipe = null;
        pinch = { distance: spread_.distance, hourPx: applied.current };
        node.style.touchAction = 'none';
      }
    }

    function onMove(event: PointerEvent) {
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pinch && points.size === 2) {
        const spread_ = spread();
        if (!spread_ || spread_.distance <= 0) return;
        event.preventDefault();
        const next = clampHourPx((pinch.hourPx * spread_.distance) / pinch.distance);
        // Hoogstens één keer per beeld. Een telefoon vuurt meer
        // `pointermove`-gebeurtenissen af dan er beelden zijn, en elk daarvan
        // een render geven maakte het knijpen schokkerig in plaats van vloeiend.
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          const current = spread();
          if (!node || !current) return;
          const offset = current.midY - node.getBoundingClientRect().top;
          pendingAnchor.current = {
            hours: (node.scrollTop + offset) / applied.current,
            offset,
          };
          setHourPx(next);
        });
        return;
      }

      if (!swipe || swipe.done) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      // Duidelijk horizontaal, anders is het gewoon scrollen. Zonder die
      // verhouding springt de dag weg bij elke schuine veeg naar beneden.
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipe.done = true;
        goto(index + (dx < 0 ? 1 : -1));
      }
    }

    function onUp(event: PointerEvent) {
      points.delete(event.pointerId);
      if (points.size === 0) swipe = null;
      if (points.size < 2) {
        pinch = null;
        release();
      }
    }

    node.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      release();
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // `hourPx` staat er bewust niet bij: het knijpen leest de actuele waarde uit
    // `applied`, en opnieuw ophangen bij elke zoomstap zou de luisteraars midden
    // in een gebaar vervangen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goto, index]);

  if (!day) return null;

  const height = HOURS * hourPx;
  const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
  const nowMinutes = now && isToday ? minutesOfDay(now) : null;

  return (
    <div className="mob-cal">
      <header className="mob-cal-bar">
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-vtk-navy/15 bg-vtk-surface text-vtk-ink"
        >
          <LogisticsIcon name="close" className="h-4 w-4" />
          <span className="sr-only">Volledig scherm sluiten</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold capitalize text-vtk-ink">
          {fullDayFormatter.format(day)}
        </p>
        {onToday ? (
          <button
            type="button"
            onClick={onToday}
            className="h-9 shrink-0 rounded-full border border-vtk-navy/15 bg-vtk-surface px-3 text-xs font-semibold text-vtk-ink"
          >
            Vandaag
          </button>
        ) : null}
        {onCreate ? (
          <button
            type="button"
            onClick={() => {
              // Het eerstvolgende hele uur op de dag die je bekijkt, een uur
              // lang. Op vandaag is dat het uur dat nu bezig is plus één; op een
              // andere dag 09:00, want daar zegt "nu" niets.
              const base = startOfBrusselsDay(day);
              const hour =
                now && isToday ? Math.min(23, Math.floor(minutesOfDay(now) / 60) + 1) : 9;
              const start = new Date(base + hour * 60 * 60 * 1000);
              onCreate(start, new Date(start.getTime() + 60 * 60 * 1000));
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-vtk-navy text-lg leading-none text-white"
          >
            <span aria-hidden>+</span>
            <span className="sr-only">Rit toevoegen op deze dag</span>
          </button>
        ) : null}
      </header>

      {/* De week als zeven knoppen. Een stip zegt dat er die dag iets staat, en
          dat is precies de vraag waarmee je hier komt: waar zit het druk? */}
      <nav className="mob-cal-days" aria-label="Dag kiezen">
        {parsedDays.map((each, at) => {
          const active = at === index;
          const isNow = todayKey !== null && dayKeyFormatter.format(each) === todayKey;
          return (
            <button
              key={days[at]}
              type="button"
              onClick={() => setIndex(at)}
              aria-current={active ? 'date' : undefined}
              className={`mob-cal-day ${active ? 'is-active' : ''} ${isNow ? 'is-today' : ''}`}
            >
              <span className="mob-cal-day-name">{weekdayFormatter.format(each)}</span>
              <span className="mob-cal-day-number">{dayNumberFormatter.format(each)}</span>
              <span className={`mob-cal-day-dot ${perDay[at] > 0 ? 'is-on' : ''}`} aria-hidden />
              {perDay[at] > 0 ? (
                <span className="sr-only">{perDay[at]} ritten</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {dayEvents.length > 0 ? (
        <div className="mob-cal-events">
          {dayEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent?.(event.id)}
              className="mob-cal-event"
            >
              <span className="truncate font-semibold">{event.name}</span>
              {event.location ? (
                <span className="truncate opacity-80">{event.location}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={scroller} className="mob-cal-body">
        <div className="mob-cal-grid" style={{ height }}>
          {/* De uren. Absoluut en niet als rijen: dan staat elk label exact op
              zijn lijn, ook wanneer knijpen de hoogte een halve pixel geeft. */}
          <div className="mob-cal-gutter" style={{ width: GUTTER }} aria-hidden>
            {Array.from({ length: HOURS }, (_, hour) => (
              <span key={hour} className="mob-cal-hour" style={{ top: hour * hourPx }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          <div className="mob-cal-day-col" style={{ marginLeft: GUTTER }}>
            {Array.from({ length: HOURS }, (_, hour) => (
              <span key={hour} className="mob-cal-line" style={{ top: hour * hourPx }} aria-hidden />
            ))}

            {dayBands.map((band) => (
              <span
                key={band.id}
                aria-hidden
                className="mob-cal-band"
                style={{
                  top: (band.from / 60) * hourPx,
                  height: Math.max(4, ((band.to - band.from) / 60) * hourPx),
                  backgroundColor: driverColorVar(band.driverId, driverColors),
                }}
              />
            ))}

            {placed.map((block) => {
              const vehicle = vehicleById.get(block.vehicleId) ?? null;
              const look = blockLook({
                block,
                vehicle,
                showDriver,
                driverColors,
                selected: selectedId === block.id,
              });
              const label = blockLabel({
                block,
                vehicle,
                showDriver,
                awaitsDriver: look.awaitsDriver,
                start: block.start,
                end: block.end,
              });
              return (
                <button
                  key={block.id}
                  type="button"
                  data-trip={block.id}
                  onClick={() => onSelect?.(block.id)}
                  title={label}
                  aria-label={label}
                  className={`mob-cal-block ${look.className}`}
                  style={{
                    ...look.style,
                    top: (block.from / 60) * hourPx,
                    height: Math.max(26, ((block.to - block.from) / 60) * hourPx),
                    // Overlappende ritten delen de breedte, net als op een breed
                    // scherm. Op één dag over de volle breedte blijft ook een
                    // half blok nog leesbaar.
                    left: `${(block.lane / block.lanes) * 100}%`,
                    width: `${(1 / block.lanes) * 100}%`,
                  }}
                >
                  <BlockContent
                    block={block}
                    vehicle={vehicle}
                    showDriver={showDriver}
                    awaitsDriver={look.awaitsDriver}
                    start={block.start}
                    end={block.end}
                    continuesBefore={block.continuesBefore}
                    continuesAfter={block.continuesAfter}
                    compact={block.lanes > 2}
                  />
                </button>
              );
            })}

            {nowMinutes !== null ? (
              <span
                aria-hidden
                className="mob-cal-now"
                style={{ top: (nowMinutes / 60) * hourPx }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <p className="mob-cal-hint">Veeg voor een andere dag, knijp om de uren groter te maken.</p>
    </div>
  );
}
