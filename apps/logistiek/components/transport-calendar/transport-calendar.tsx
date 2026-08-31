'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { vehiclePatternClass } from '@/lib/driver-colors';
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  type CalendarView,
} from '@/lib/calendar-range';
import { LogisticsIcon } from '@/components/logistics-icon';
import { MonthGrid } from './month-grid';
import { TimeGrid } from './time-grid';
import { vehicleIcon } from './trip-block';
import {
  HOUR_PX_DEFAULT,
  HOUR_PX_MAX,
  HOUR_PX_MIN,
  HOUR_PX_STEP,
  ZOOM_STORAGE_KEY,
  clampHourPx,
  type CalendarVehicle,
  type TripBlock,
} from './types';

/**
 * De transportplanning: dag, week of maand, met de navigatie erboven.
 *
 * De weergave en de datum staan in de URL (`?weergave=week&datum=2026-09-01`) en
 * niet in de state van deze component. Drie redenen: de pagina blijft
 * server-gerenderd (de query haalt precies het venster op dat je ziet), een
 * collega kan je een link naar een bepaalde week sturen, en de terugknop van de
 * browser doet wat je verwacht.
 *
 * De klok in de kalender is Belgisch; de dagen komen binnen als UTC-middernacht
 * van een Belgische dag, zoals overal in deze module (zie `lib/week-lanes.ts`).
 */

export function TransportCalendar({
  view,
  anchor,
  days,
  vehicles,
  blocks,
  driverColors,
  selectedId,
  onSelect,
  emptyLabel,
  showDriver = true,
  toolbarExtra,
  children,
}: {
  view: CalendarView;
  /** De dag waar de weergave op staat, als ISO-string van UTC-middernacht. */
  anchor: string;
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  driverColors?: DriverColorOverrides;
  selectedId?: string | null;
  onSelect?: (blockId: string) => void;
  emptyLabel: string;
  showDriver?: boolean;
  /** Extra knoppen in de werkbalk (filters, "nieuwe rit", ...). */
  toolbarExtra?: React.ReactNode;
  /** Wat onder de kalender komt: de legende staat er al, dit komt erna. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const shell = useRef<HTMLDivElement>(null);

  // De nu-lijn pas na de eerste render: de server kent het uur van de bezoeker
  // niet, en een lijn die er bij de hydratie anders uitziet, is een hydratiefout.
  const [now, setNow] = useState<Date | undefined>(undefined);
  useEffect(() => {
    setNow(new Date());
    // Elke minuut opnieuw. Een tragere klok laat de lijn achter de werkelijkheid
    // aanlopen op precies het moment dat iemand naar "is de kar al weg?" kijkt.
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Dezelfde URL met een andere weergave of datum; de rest van de query blijft. */
  const hrefFor = useCallback(
    (next: { weergave?: CalendarView; datum?: string | null }) => {
      const query = new URLSearchParams(params.toString());
      if (next.weergave) query.set('weergave', next.weergave);
      if (next.datum === null) query.delete('datum');
      else if (next.datum) query.set('datum', next.datum);
      const search = query.toString();
      return search ? `${pathname}?${search}` : pathname;
    },
    [params, pathname]
  );

  /**
   * Zoom: hoe hoog één uur is.
   *
   * In een effect en niet als beginwaarde, om dezelfde reden als de nu-lijn: op
   * de server bestaat `localStorage` niet, en een andere eerste render dan de
   * server geeft een hydratiefout. Lezen én schrijven in een try/catch, want in
   * een privévenster gooit de accessor zelf.
   */
  const [hourPx, setHourPx] = useState(HOUR_PX_DEFAULT);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ZOOM_STORAGE_KEY);
      if (saved !== null) setHourPx(clampHourPx(Number(saved)));
    } catch {
      /* privévenster: dan gewoon de standaardhoogte */
    }
  }, []);

  const zoomTo = useCallback((next: number) => {
    const value = clampHourPx(next);
    setHourPx(value);
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, String(value));
    } catch {
      /* niet kunnen onthouden is geen reden om niet te zoomen */
    }
  }, []);

  // Ctrl/⌘ + scrollen zoomt, zoals in een tekenprogramma. Zonder die modifier
  // blijft scrollen gewoon scrollen: de kalender is hoger dan het scherm, en een
  // pagina die onder je muis wegspringt is erger dan geen zoom.
  //
  // Niet via `onWheel` op het element: React hangt dat passief op, en een
  // passieve listener mag `preventDefault()` niet doen, waardoor de browser
  // eroverheen zijn eigen paginazoom doet.
  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setHourPx((current) => {
        const value = clampHourPx(current - Math.sign(event.deltaY) * HOUR_PX_STEP);
        try {
          window.localStorage.setItem(ZOOM_STORAGE_KEY, String(value));
        } catch {
          /* zie zoomTo */
        }
        return value;
      });
    }
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  /**
   * Volledig scherm.
   *
   * `requestFullscreen()` bestaat niet op een `div` in Safari op iOS; daar (en
   * overal waar de API weigert) valt het terug op een vast paneel over de pagina.
   * Dat is niet hetzelfde, maar het doet wat het team vraagt: de hele week zonder
   * de rest van het scherm eromheen.
   */
  const [fullscreen, setFullscreen] = useState<false | 'native' | 'fallback'>(false);

  useEffect(() => {
    function onChange() {
      // Sluiten via de Escape-toets of de systeemknop laat de API los zonder ons
      // te vragen; zonder deze luisteraar blijft de knop "sluiten" beweren.
      if (!document.fullscreenElement) setFullscreen((current) => (current === 'native' ? false : current));
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // In de terugvalvorm vangt de browser Escape niet af, dus doen we het zelf.
  useEffect(() => {
    if (fullscreen !== 'fallback') return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setFullscreen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const node = shell.current;
    if (!node) return;
    if (fullscreen) {
      if (fullscreen === 'native' && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      setFullscreen(false);
      return;
    }
    try {
      await node.requestFullscreen();
      setFullscreen('native');
    } catch {
      setFullscreen('fallback');
    }
  }, [fullscreen]);

  const openDay = useCallback(
    (dayIso: string) => {
      router.push(hrefFor({ weergave: 'dag', datum: dayIso.slice(0, 10) }));
    },
    [hrefFor, router]
  );

  const iconButton =
    'grid h-8 w-8 place-items-center rounded-full border border-vtk-navy/15 text-vtk-navy transition hover:border-vtk-navy/40 disabled:opacity-40';

  return (
    <div ref={shell} className="transport-calendar grid gap-3" data-fullscreen={fullscreen || undefined}>
      <div className="transport-calendar-toolbar flex flex-wrap items-center gap-2">
        {/* Weergavekeuze. Segmenten en geen keuzelijst: het zijn er drie, en je
            wisselt er de hele tijd tussen. */}
        <div
          className="inline-flex overflow-hidden rounded-full border border-vtk-navy/15"
          role="group"
          aria-label="Weergave"
        >
          {CALENDAR_VIEWS.map((option) => (
            <Link
              key={option}
              href={hrefFor({ weergave: option })}
              aria-current={option === view ? 'true' : undefined}
              className={`px-3.5 py-1.5 text-sm font-medium transition ${
                option === view
                  ? 'bg-vtk-navy text-white'
                  : 'text-vtk-ink hover:bg-vtk-navy/5'
              }`}
            >
              {CALENDAR_VIEW_LABELS[option]}
            </Link>
          ))}
        </div>

        {toolbarExtra}

        {/* Zoom en volledig scherm helemaal rechts: het zijn kijkinstellingen en
            geen acties op de planning. In de maandweergave is de uurhoogte
            betekenisloos, dus daar staat de zoom er niet. */}
        <div className="ml-auto flex items-center gap-1.5">
          {view === 'maand' ? null : (
            <>
              <button
                type="button"
                onClick={() => zoomTo(hourPx - HOUR_PX_STEP)}
                disabled={hourPx <= HOUR_PX_MIN}
                title="Uitzoomen (of Ctrl/⌘ + scrollen)"
                className={iconButton}
              >
                <span aria-hidden className="text-base leading-none">−</span>
                <span className="sr-only">Uitzoomen</span>
              </button>
              <button
                type="button"
                onClick={() => zoomTo(hourPx + HOUR_PX_STEP)}
                disabled={hourPx >= HOUR_PX_MAX}
                title="Inzoomen (of Ctrl/⌘ + scrollen)"
                className={iconButton}
              >
                <span aria-hidden className="text-base leading-none">+</span>
                <span className="sr-only">Inzoomen</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={fullscreen ? 'Volledig scherm sluiten (Esc)' : 'Volledig scherm'}
            aria-pressed={Boolean(fullscreen)}
            className={
              fullscreen
                ? 'grid h-8 w-8 place-items-center rounded-full border border-vtk-navy bg-vtk-navy text-white transition'
                : iconButton
            }
          >
            <LogisticsIcon
              name={fullscreen ? 'collapse' : 'expand'}
              className="h-4 w-4"
            />
            <span className="sr-only">
              {fullscreen ? 'Volledig scherm sluiten' : 'Volledig scherm'}
            </span>
          </button>
        </div>
      </div>

      {view === 'maand' ? (
        <MonthGrid
          days={days}
          anchor={anchor}
          vehicles={vehicles}
          blocks={blocks}
          onSelect={onSelect}
          onOpenDay={openDay}
          selectedId={selectedId}
          emptyLabel={emptyLabel}
          showDriver={showDriver}
          driverColors={driverColors}
          now={now}
        />
      ) : (
        <TimeGrid
          days={days}
          vehicles={vehicles}
          blocks={blocks}
          onSelect={onSelect}
          selectedId={selectedId}
          emptyLabel={emptyLabel}
          showDriver={showDriver}
          driverColors={driverColors}
          hourPx={hourPx}
          now={now}
        />
      )}

      {/* Welk icoon en welke arcering horen bij welk voertuig (K1). Allebei staan
          ze in het blok, dus zonder deze regel moet je raden wat het karretje
          voorstelt en waarom het gestreept is. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vtk-muted">
        {vehicles.map((vehicle) => (
          <li key={vehicle.id} className="flex items-center gap-1.5">
            {/* Enkel wanneer er een arcering ingesteld is: een leeg vierkantje
                naast elk voertuig leest als een uitgevinkt selectievakje. */}
            {vehiclePatternClass(vehicle.pattern) ? (
              <span
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border border-vtk-navy/20 bg-vtk-paper ${vehiclePatternClass(
                  vehicle.pattern
                )}`}
              />
            ) : null}
            <LogisticsIcon name={vehicleIcon(vehicle.code)} className="h-3.5 w-3.5 shrink-0" />
            {vehicle.name}
          </li>
        ))}
      </ul>

      {children}
    </div>
  );
}

/**
 * De navigatie naast de titel: vorige, vandaag, volgende.
 *
 * Apart van de kalender omdat de pagina de titel eromheen zet ("Week 36" met het
 * datumbereik eronder), en die hoort bij de kop van de pagina en niet in de
 * werkbalk.
 */
export function CalendarNav({
  previousHref,
  nextHref,
  todayHref,
  isToday,
  label,
}: {
  previousHref: string;
  nextHref: string;
  todayHref: string;
  isToday: boolean;
  /** "week", "maand" of "dag": wat vorige en volgende verschuiven. */
  label: string;
}) {
  const buttonClass =
    'rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40';
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label={`${label} kiezen`}>
      <Link href={previousHref} className={buttonClass} title={`Vorige ${label}`}>
        ← <span className="sr-only">Vorige {label}</span>
      </Link>
      <Link
        href={todayHref}
        aria-current={isToday ? 'true' : undefined}
        className={
          isToday
            ? 'rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 font-semibold text-white'
            : buttonClass
        }
      >
        Vandaag
      </Link>
      <Link href={nextHref} className={buttonClass} title={`Volgende ${label}`}>
        → <span className="sr-only">Volgende {label}</span>
      </Link>
    </nav>
  );
}
