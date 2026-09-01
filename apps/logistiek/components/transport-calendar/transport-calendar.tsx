'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { EventBars, type CalendarEventBar } from './event-bars';
import { MonthGrid } from './month-grid';
import { TimeGrid, timeGridColumns } from './time-grid';
import { vehicleIcon } from './trip-block';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  ZOOM_STORAGE_KEY,
  clampZoom,
  hourPxFor,
  wheelPixels,
  zoomByWheel,
  type AvailabilityBand,
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
  onMoveBlock,
  onCreateRange,
  events,
  onSelectEvent,
  selectedEventId,
  bands,
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
  /** Een rit verslepen of rekken; enkel in dag- en weekweergave (P4). */
  onMoveBlock?: (blockId: string, startAt: Date, endAt: Date) => void;
  /** Slepen op lege ruimte: een nieuwe rit op dat moment. */
  onCreateRange?: (startAt: Date, endAt: Date) => void;
  /**
   * De evenementen als strook boven het rooster (P5). Leeg of weggelaten laat de
   * strook weg; in de maandweergave staan de ritten al als balken en zou een
   * tweede rij balken erboven niet te onderscheiden zijn.
   */
  events?: CalendarEventBar[];
  onSelectEvent?: (eventId: string) => void;
  selectedEventId?: string | null;
  /** Beschikbaarheid van de chauffeurs als lichte band achter het rooster (V1). */
  bands?: AvailabilityBand[];
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
   * Zoom, als factor op "de hele dag past in beeld" (zie `types.ts`).
   *
   * In een effect en niet als beginwaarde, om dezelfde reden als de nu-lijn: op
   * de server bestaat `localStorage` niet, en een andere eerste render dan de
   * server geeft een hydratiefout. Lezen én schrijven in een try/catch, want in
   * een privévenster gooit de accessor zelf.
   */
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const scroller = useRef<HTMLDivElement>(null);
  const metrics = useRef({ fitHourPx: 0, headHeight: 0 });
  /**
   * Twee zoomwaarden, en dat verschil is de reden dat het zoomen niet meer
   * schokt.
   *
   * `zoomTarget` is waar we naartoe gaan en loopt meteen mee met elke
   * gebeurtenis, zodat een tweede wieltik verder telt vanaf de eerste.
   * `zoomApplied` is wat er op dat moment écht getekend staat, en enkel daarmee
   * mag je de scrollpositie omrekenen: `scrollTop` hoort bij de hoogtes die nu
   * in het scherm staan. Met één ref rekende een tweede gebeurtenis vóór de
   * render de uren om met een uurhoogte die nog niet bestond, en dan sprong de
   * dag weg.
   */
  const zoomTarget = useRef(zoom);
  const zoomApplied = useRef(zoom);
  /** Het uur dat na deze render weer op zijn plek moet komen. */
  const pendingAnchor = useRef<{ hours: number; anchor: number } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ZOOM_STORAGE_KEY);
      if (saved !== null) setZoom(clampZoom(Number(saved)));
    } catch {
      /* privévenster: dan gewoon op passend */
    }
  }, []);

  /**
   * Zoomen mét anker: het uur dat je vasthoudt, blijft staan waar het staat.
   *
   * Zonder dit springt de dag weg onder je muis, want de scrollpositie is een
   * pixelafstand en die betekent na het zoomen een ander uur. Dat is precies wat
   * "de zoom werkt niet deftig" betekende: technisch werd alles hoger, maar je
   * keek daarna naar een ander stuk van de dag.
   *
   * `anchorY` is de plek in de pane die vast moet blijven (de muis bij scrollen,
   * het midden bij de knoppen). We rekenen om naar het uur op dat punt, zoomen,
   * en zetten de scroll terug zodat datzelfde uur weer op dat punt ligt.
   */
  const zoomAround = useCallback((next: number, anchorY?: number) => {
    const value = clampZoom(next);
    const node = scroller.current;
    const { fitHourPx: fit, headHeight } = metrics.current;

    if (node && fit > 0) {
      // Het anker gemeten vanaf 00:00, dus vanaf ónder de vastgeplakte dagkop.
      // Zonder die aftrek schuift de dag bij elke zoomstap een kophoogte weg.
      const anchor = (anchorY ?? node.clientHeight / 2) - headHeight;
      const shown = hourPxFor(fit, zoomApplied.current);
      pendingAnchor.current = { hours: (node.scrollTop + anchor) / shown, anchor };
    }

    zoomTarget.current = value;
    setZoom(value);
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, String(value));
    } catch {
      /* niet kunnen onthouden is geen reden om niet te zoomen */
    }
  }, []);

  /**
   * De scrollpositie terugzetten zodat het vastgehouden uur weer op zijn plek
   * ligt.
   *
   * In een layout-effect en niet in een `requestAnimationFrame`: dat laatste
   * loopt niet gegarandeerd ná de commit, dus de browser klemde de nieuwe
   * scrollpositie soms nog op de oude, kleinere inhoud. Dat gaf precies de
   * sprongetjes bij het inzoomen. Een layout-effect draait ná de DOM en vóór
   * het schilderen, dus de nieuwe hoogtes staan er en niemand ziet de tussenstap.
   */
  useLayoutEffect(() => {
    zoomApplied.current = zoom;
    zoomTarget.current = zoom;
    const pending = pendingAnchor.current;
    pendingAnchor.current = null;
    const node = scroller.current;
    const { fitHourPx: fit } = metrics.current;
    if (!pending || !node || fit <= 0) return;
    const target = pending.hours * hourPxFor(fit, zoom) - pending.anchor;
    node.scrollTop = Math.max(0, Math.min(target, node.scrollHeight - node.clientHeight));
  }, [zoom]);

  /**
   * Ctrl/⌘ + scrollen zoomt op de muis, zoals in een tekenprogramma en zoals de
   * browser dat zelf met de pagina doet. Zonder die modifier blijft scrollen
   * gewoon scrollen: de dag is hoger dan de pane, en een kalender die onder je
   * muis wegspringt is erger dan geen zoom.
   *
   * Niet via `onWheel` op het element: React hangt dat passief op, en een
   * passieve luisteraar mag `preventDefault()` niet doen, waardoor de browser
   * eroverheen zijn eigen paginazoom doet.
   */
  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const pane = scroller.current;
      const anchor = pane ? event.clientY - pane.getBoundingClientRect().top : undefined;
      // De afstand telt, niet het aantal gebeurtenissen: zie `zoomByWheel`.
      zoomAround(zoomByWheel(zoomTarget.current, wheelPixels(event)), anchor);
    }
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  /**
   * Knijpen met twee vingers zoomt, op het midden tussen je vingers.
   *
   * Op een telefoon bestaat ctrl+scrollen niet, en dan waren de twee knopjes in
   * de werkbalk de enige manier om te zoomen. Dat is op het scherm waar zoom het
   * meest nodig is precies het gebaar dat iedereen als eerste probeert.
   *
   * Het gebaar is **absoluut** en niet optellend: de verhouding wordt tegen de
   * zoom bij het neerzetten van de tweede vinger gerekend. Bij optellen stapelen
   * de afrondingen zich per beweging op en kruipt de kalender weg terwijl je
   * stilhoudt.
   *
   * Zolang er geknepen wordt staat `touch-action` op `none`, zodat de pane niet
   * tegelijk meescrolt met het gebaar. Daarbuiten blijft ze `pan-x pan-y`, dus
   * gewoon vegen scrollt zoals altijd.
   */
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    const points = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; zoom: number } | null = null;

    function spread(): { distance: number; midY: number } | null {
      const [a, b] = [...points.values()];
      if (!a || !b) return null;
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), midY: (a.y + b.y) / 2 };
    }

    function onDown(event: PointerEvent) {
      if (event.pointerType === 'mouse') return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const now = spread();
      if (points.size === 2 && now && now.distance > 0) {
        pinch = { distance: now.distance, zoom: zoomTarget.current };
        if (node) node.style.touchAction = 'none';
      }
    }

    function onMove(event: PointerEvent) {
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch || points.size !== 2) return;
      const now = spread();
      if (!now || now.distance <= 0) return;
      event.preventDefault();
      const top = node ? node.getBoundingClientRect().top : 0;
      zoomAround((pinch.zoom * now.distance) / pinch.distance, now.midY - top);
    }

    function onUp(event: PointerEvent) {
      points.delete(event.pointerId);
      if (points.size < 2 && pinch) {
        pinch = null;
        if (node) node.style.touchAction = '';
      }
    }

    node.addEventListener('pointerdown', onDown);
    // Op window, want een vinger mag tijdens het knijpen buiten de pane komen.
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [zoomAround]);

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
    } catch (error) {
      // Safari op iOS heeft geen fullscreen-API op een `div`, en sommige
      // browsers weigeren ze in een iframe of zonder gebruikersactie. Dan het
      // vaste paneel; de reden gaat naar de console, want "hij doet het niet"
      // is anders niet na te trekken.
      console.info('[planning] volledig scherm valt terug op een vast paneel:', error);
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
                onClick={() => zoomAround(zoom / ZOOM_STEP)}
                disabled={zoom <= ZOOM_MIN}
                title="Uitzoomen (of Ctrl/⌘ + scrollen)"
                className={iconButton}
              >
                <span aria-hidden className="text-base leading-none">−</span>
                <span className="sr-only">Uitzoomen</span>
              </button>
              {/* Het zoomniveau in woorden, want een knop die uitgrijst zonder
                  te zeggen waarom, leest als kapot. "Hele dag" is zoom 1: dan
                  past de dag exact en valt er niets meer uit te zoomen. */}
              <button
                type="button"
                onClick={() => zoomAround(ZOOM_MIN)}
                disabled={zoom <= ZOOM_MIN}
                title="Terug naar de hele dag"
                className="rounded-full border border-vtk-navy/15 px-2.5 py-1 text-xs font-medium tabular-nums text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-40"
              >
                {zoom <= ZOOM_MIN ? 'Hele dag' : `${Math.round(zoom * 100)}%`}
              </button>
              <button
                type="button"
                onClick={() => zoomAround(zoom * ZOOM_STEP)}
                disabled={zoom >= ZOOM_MAX}
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
          zoom={zoom}
          scrollerRef={scroller}
          onMetrics={(value) => {
            metrics.current = value;
          }}
          now={now}
          onMoveBlock={onMoveBlock}
          onCreateRange={onCreateRange}
          bands={bands}
          above={
            events && events.length > 0 ? (
              <EventBars
                days={days}
                events={events}
                onSelect={onSelectEvent}
                selectedId={selectedEventId}
                columns={timeGridColumns(days.length)}
              />
            ) : undefined
          }
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
