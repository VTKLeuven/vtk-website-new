'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from '@vtk/ui/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { vehiclePatternClass } from '@/lib/driver-colors';
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  MAX_DAYS_COUNT,
  MIN_DAYS_COUNT,
  type CalendarView,
} from '@/lib/calendar-range';
import { LogisticsIcon } from '@/components/logistics-icon';
import { EventBars, type CalendarEventBar } from './event-bars';
import { TripFieldPicker } from './field-picker';
import { MobileCalendar } from './mobile-calendar';
import { MonthGrid } from './month-grid';
import { RangeFields } from './range-picker';
import { TimeGrid, timeGridColumns } from './time-grid';
import { vehicleIconName } from '@/lib/vehicle-icon';
import {
  DEFAULT_TRIP_FIELDS,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  clampZoom,
  hourPxFor,
  wheelPixels,
  zoomByWheel,
  type AvailabilityBand,
  type CalendarVehicle,
  type TripBlock,
  type TripFields,
} from './types';
import type { LogistiekLocale } from '@/lib/i18n-shared';
import { CalendarCopyProvider, useCalendarCopy } from './copy';
import { legacyPlannerPrefs, updatePlannerPrefs, type PlannerPrefs } from './prefs';

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

export function TransportCalendar(props: Parameters<typeof TransportCalendarShell>[0]) {
  return (
    <CalendarCopyProvider locale={props.locale ?? 'nl'}>
      <TransportCalendarShell {...props} />
    </CalendarCopyProvider>
  );
}

function TransportCalendarShell({
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
  toolbarMenu,
  onMoveBlock,
  onCreateRange,
  events,
  onSelectEvent,
  selectedEventId,
  bands,
  draft,
  nav,
  views = true,
  children,
  initialPrefs,
  header,
  availability,
  bandsAs,
  foldNight = false,
  layout,
  focus,
  customRange,
}: {
  view: CalendarView;
  /**
   * Tijdrooster of raster van weken (`CalendarRange.layout`). Weggelaten volgt
   * het de weergave: enkel de maand is een raster. Een eigen bereik van meer dan
   * twee weken is dat ook, en dat weet enkel de server.
   */
  layout?: 'time' | 'month';
  /** Bij een raster: de dagen van het bereik zelf, als ISO; de rest vervaagt. */
  focus?: { from: string; to: string } | null;
  /** Het eigen bereik waar de planning op staat (`YYYY-MM-DD`), voor de keuze. */
  customRange?: { first: string; last: string } | null;
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
  /**
   * Werkbalkknoppen die op een breed scherm naast `toolbarExtra` staan en op een
   * telefoon achter "Meer" gaan (M2): wat je niet bij elke blik nodig hebt.
   */
  toolbarMenu?: React.ReactNode;
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
  /** De rit die je aan het aanmaken bent, als grijs blok op het rooster. */
  draft?: { startAt: string; endAt: string } | null;
  /**
   * Waar vorige, volgende en vandaag naartoe gaan. De pagina zet dezelfde
   * knoppen naast de titel (`CalendarNav`); de telefoonweergave in volledig
   * scherm heeft ze nodig omdat daar geen paginakop meer staat.
   */
  nav?: { previousHref: string; nextHref: string; todayHref: string };
  /**
   * Staat de keuze dag/week/maand in de werkbalk? Uit op het publieke
   * bezettingsoverzicht: die pagina kent enkel weken (`?week=`), en drie
   * segmenten waarvan er twee nergens heen gaan, zijn erger dan geen keuze.
   */
  views?: boolean;
  /** Wat onder de kalender komt: de legende staat er al, dit komt erna. */
  children?: React.ReactNode;
  /**
   * De taal van de bediening (zoomknoppen, filters, dagkoppen, ritblokken).
   * Standaard Nederlands, zoals het beheer; de ledenpagina's geven de taal
   * van de bezoeker mee. Zie `copy.tsx`.
   */
  locale?: LogistiekLocale;
  /**
   * De kijkvoorkeuren uit de cookie, gelezen door de server (zie `prefs.ts`).
   * Daarmee staat de eerste render meteen op de juiste zoom en met de juiste
   * regels. `null` of weggelaten: nog geen cookie, en dan neemt de browser één
   * keer over wat hij nog in `localStorage` had.
   */
  initialPrefs?: PlannerPrefs | null;
  /**
   * Wat boven de werkbalk komt: de titel van de periode, de navigatie en de
   * tellers. In de shell en niet erboven, zodat het in volledig scherm blijft
   * staan; daar is de pagina eromheen weg.
   */
  header?: ReactNode;
  /**
   * De knop Beschikbaarheid in de werkbalk, met de stand die de pagina bijhoudt.
   * Weglaten laat de knop weg, zoals op het bezettingsoverzicht.
   */
  availability?: { on: boolean; onToggle: () => void };
  /** Hoe de banden er staan; zie `TimeGrid`. */
  bandsAs?: 'background' | 'tracks';
  /**
   * De nacht (00:00 tot 06:00) als strook die je openklapt, in de dag- en
   * weekweergave. Enkel in de planning van het team.
   */
  foldNight?: boolean;
}) {
  const t = useCalendarCopy();
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
    (next: {
      weergave?: CalendarView;
      datum?: string | null;
      aantal?: number;
      van?: string;
      tot?: string;
    }) => {
      const query = new URLSearchParams(params.toString());
      if (next.weergave) query.set('weergave', next.weergave);
      // Een eigen bereik en een anker sluiten elkaar uit: wie van het ene naar het
      // andere gaat, mag de parameters van het vorige niet meeslepen.
      if (next.weergave === 'aangepast') {
        query.delete('datum');
        query.delete('aantal');
      } else if (next.weergave) {
        query.delete('van');
        query.delete('tot');
      }
      if (next.van) query.set('van', next.van);
      if (next.tot) query.set('tot', next.tot);
      if (next.aantal) query.set('aantal', String(next.aantal));
      if (next.datum === null) query.delete('datum');
      else if (next.datum) query.set('datum', next.datum);
      const search = query.toString();
      return search ? `${pathname}?${search}` : pathname;
    },
    [params, pathname]
  );

  /** Het raster van weken in plaats van het tijdrooster: de maand, of een lang eigen bereik. */
  const asMonth = (layout ?? (view === 'maand' ? 'month' : 'time')) === 'month';

  /**
   * "Aangepast" net aangeklikt, terwijl de server het bereik nog laadt.
   *
   * Het segment kleurt meteen en schuift open, ook al staat de URL nog op de
   * vorige weergave; gekoppeld aan die URL, zodat het vanzelf vervalt zodra de
   * nieuwe binnen is (of je met "terug" ergens anders belandt).
   */
  const [customPendingFor, setCustomPendingFor] = useState<string | null>(null);
  const urlKey = params.toString();
  const customActive = view === 'aangepast' || customPendingFor === urlKey;

  /**
   * Het bereik waarmee "Aangepast" begint: wat je op dat moment ziet. Een week
   * blijft dezelfde week, een maand de dagen van die maand; enkel vanuit één dag
   * wordt het twee weken, want een eigen bereik van één dag is de dagweergave.
   */
  const startRange = useCallback((): { van: string; tot: string } => {
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const first = new Date(days[0] ?? anchor);
    const lastShown = new Date(days[days.length - 1] ?? anchor);
    if (view === 'maand') {
      const month = new Date(anchor);
      const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
      const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
      return { van: iso(start), tot: iso(end) };
    }
    if (days.length < 2) {
      return { van: iso(first), tot: iso(new Date(first.getTime() + 13 * 24 * 60 * 60 * 1000)) };
    }
    return { van: iso(first), tot: iso(lastShown) };
  }, [anchor, days, view]);

  const openCustom = useCallback(() => {
    if (view === 'aangepast') return;
    setCustomPendingFor(urlKey);
    router.push(hrefFor({ weergave: 'aangepast', ...startRange() }), { scroll: false });
  }, [hrefFor, router, startRange, urlKey, view]);

  /** Een datum aangepast: meteen laden, zonder een stap in de geschiedenis per veld. */
  const changeCustom = useCallback(
    (van: string, tot: string) => {
      router.replace(hrefFor({ weergave: 'aangepast', van, tot }), { scroll: false });
    },
    [hrefFor, router]
  );

  /**
   * Zoom, als factor op "de hele dag past in beeld" (zie `types.ts`).
   *
   * Als beginwaarde uit de cookie die de server las (`initialPrefs`), en niet in
   * een effect uit `localStorage`: zo staat de eerste render meteen op de
   * bewaarde zoom. Uit `localStorage` lezen kon pas na de hydratie, en dan
   * verscheen de week eerst op "hele dag" en sprong ze daarna naar je zoom.
   */
  const [zoom, setZoom] = useState(initialPrefs?.zoom ?? ZOOM_MIN);

  /**
   * Wat er in een rit-blok staat (R7). Om dezelfde reden als de zoom uit de
   * cookie. De standaard is de weergave zoals ze altijd was, dus wie niets
   * instelt merkt niets.
   */
  const [fields, setFields] = useState<TripFields>(initialPrefs?.fields ?? DEFAULT_TRIP_FIELDS);

  /** De nacht open of ingeklapt (`foldNight`); onthouden zoals de zoom. */
  const [nightOpen, setNightOpen] = useState(initialPrefs?.nightOpen ?? false);

  /**
   * Nog geen cookie: één keer overnemen wat deze browser in `localStorage` had
   * van voor de cookie, en dan meteen een cookie schrijven, zodat de server het
   * de volgende keer weet. Dit is de enige keer dat de kalender na het laden nog
   * van zoom verandert.
   */
  useEffect(() => {
    if (initialPrefs) return;
    const legacy = legacyPlannerPrefs();
    if (legacy) {
      setZoom(legacy.zoom);
      setFields(legacy.fields);
    }
    updatePlannerPrefs(legacy ?? {});
    // Enkel bij het openen; daarna houdt de cookie het bij.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFields = useCallback((next: TripFields) => {
    setFields(next);
    updatePlannerPrefs({ fields: next });
  }, []);

  const toggleNight = useCallback(() => {
    const next = !nightOpen;
    setNightOpen(next);
    updatePlannerPrefs({ nightOpen: next });
  }, [nightOpen]);

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
  /** Staat de kalender er al? Pas dan is een zoomwijziging iets om te onthouden. */
  const zoomMounted = useRef(false);

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
    // Onthouden per getekende stand en niet per wieltik: een trackpad stuurt er
    // dertig per gebaar, en enkel de laatste telt. Niet bij het openen: dan is
    // dit de stand die net uit de cookie kwam.
    if (zoomMounted.current) updatePlannerPrefs({ zoom });
    zoomMounted.current = true;
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

  /**
   * Smal scherm? Bepaalt of volledig scherm de telefoonweergave krijgt.
   *
   * Via `matchMedia` en niet via een CSS-klasse, want het gaat hier niet om hoe
   * iets eruitziet maar om wélke component er rendert; dat kan CSS niet. In een
   * effect, want op de server bestaat `window` niet en een andere eerste render
   * dan de server is een hydratiefout.
   */
  // Begint bij wat de cookie de vorige keer zag, zodat een telefoon meteen de
  // werkbalk van een telefoon krijgt in plaats van eerst die van een laptop.
  const [narrow, setNarrow] = useState(initialPrefs?.narrow ?? false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const apply = () => {
      setNarrow(query.matches);
      // De server leest dit bij het volgende bezoek: dan opent een telefoon
      // meteen op één dag (zie de pagina) en hoeft er niets meer te wisselen.
      updatePlannerPrefs({ narrow: query.matches });
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  // Op een telefoon opent de planning op één dag (M2): zeven kolommen van vijftig
  // pixels lezen daar niet. Enkel zolang er geen keuze in de URL staat; wie zelf
  // "Week" kiest, houdt de week. Staat de dag er al (de server wist uit de
  // cookie dat dit een telefoon is), dan valt er niets te wisselen.
  useEffect(() => {
    if (!narrow || !views || view === 'dag' || params.get('weergave')) return;
    router.replace(hrefFor({ weergave: 'dag' }), { scroll: false });
  }, [narrow, views, view, params, router, hrefFor]);

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

  /**
   * Op een telefoon krijgt volledig scherm een eigen weergave (één dag over de
   * volle breedte) in plaats van de weekweergave die kleiner gezet is. Zie
   * `MobileCalendar` voor het waarom.
   *
   * Ze staat bínnen dezelfde shell: bij echte fullscreen is alles wat erbuiten
   * gerenderd wordt onzichtbaar, en het detailpaneel (`children`) hoort erbij.
   * De maandweergave houdt haar raster; daar is één dag geen antwoord op "hoe
   * ziet de maand eruit".
   */
  const phoneFullscreen = Boolean(fullscreen) && narrow && !asMonth;

  if (phoneFullscreen) {
    return (
      <div
        ref={shell}
        className="transport-calendar"
        data-fullscreen={fullscreen || undefined}
        data-phone="true"
      >
        <MobileCalendar
          days={days}
          vehicles={vehicles}
          blocks={blocks}
          events={events}
          bands={bands}
          driverColors={driverColors}
          showDriver={showDriver}
          fields={fields}
          selectedId={selectedId}
          onSelect={onSelect}
          onSelectEvent={onSelectEvent}
          onClose={toggleFullscreen}
          onCreate={onCreateRange}
          onPrevRange={nav ? () => router.push(nav.previousHref) : undefined}
          onNextRange={nav ? () => router.push(nav.nextHref) : undefined}
          onToday={nav ? () => router.push(nav.todayHref) : undefined}
          now={now}
        />
        {children}
      </div>
    );
  }

  // De onderdelen van de werkbalk, één keer gebouwd en per schermbreedte anders
  // geschikt (zie de werkbalk hieronder).
  const viewSegments = views ? (
          // Op een breed scherm één aaneengesloten balk; in het menu op een
          // telefoon losse pillen die mogen afbreken. Vijf segmenten op één
          // regel pasten daar niet: "Aangepast" viel weg achter de rand.
          <div
            className={
              narrow
                ? 'flex flex-wrap gap-1.5'
                : 'inline-flex overflow-hidden rounded-full border border-vtk-navy/15'
            }
            role="group"
            aria-label={t.view}
          >
            {CALENDAR_VIEWS.map((option) =>
              option === 'aangepast' ? (
                // Een knop en geen link: ze zet de planning op wat je nu ziet en
                // schuift open met de twee datums, in het segment zelf. Een
                // datum aanklikken laadt meteen; er is geen apart venster.
                // Op een telefoon mogen de datums onder het woord afbreken: naast
                // elkaar liepen ze uit het menu.
                <span
                  key={option}
                  className={`flex items-center transition-colors ${
                    narrow
                      ? customActive
                        ? 'flex-wrap rounded-[18px] border border-vtk-navy/15 pb-1.5'
                        : 'rounded-full border border-vtk-navy/15'
                      : ''
                  } ${customActive ? 'bg-vtk-navy text-vtk-on-emphasis' : 'text-vtk-ink'}`}
                >
                  <button
                    type="button"
                    aria-current={customActive ? 'true' : undefined}
                    aria-expanded={customActive}
                    title={t.range.open}
                    onClick={openCustom}
                    className={`px-3.5 py-1.5 text-sm font-medium transition ${
                      customActive ? '' : 'hover:bg-vtk-navy/5'
                    } ${narrow ? 'rounded-full' : ''}`}
                  >
                    {CALENDAR_VIEW_LABELS[option]}
                  </button>
                  {customActive ? (
                    <span className={`range-slide flex items-center ${narrow ? 'px-1.5' : 'pr-1.5'}`}>
                      <RangeFields
                        first={customRange?.first ?? startRange().van}
                        last={customRange?.last ?? startRange().tot}
                        onChange={changeCustom}
                      />
                    </span>
                  ) : null}
                </span>
              ) : (
                <Link
                  key={option}
                  // "Komende dagen" begint bij vandaag, niet bij de dag waar je net
                  // op stond: anders zie je na het wisselen een venster dat mogelijk
                  // helemaal in het verleden ligt.
                  href={hrefFor({ weergave: option, ...(option === 'dagen' ? { datum: null } : {}) })}
                  aria-current={option === view && !customActive ? 'true' : undefined}
                  className={`px-3.5 py-1.5 text-sm font-medium transition ${
                    narrow ? 'rounded-full border border-vtk-navy/15' : ''
                  } ${
                    option === view && !customActive
                      ? 'bg-vtk-navy text-vtk-on-emphasis'
                      : 'text-vtk-ink hover:bg-vtk-navy/5'
                  }`}
                >
                  {CALENDAR_VIEW_LABELS[option]}
                </Link>
              )
            )}
          </div>
        ) : null;
  // Hoeveel dagen "komende dagen" toont (F6.3). Een keuzelijst en geen
  // segmenten: er zijn er dertien, en je zet ze zelden om.
  const daysSelect = views && view === 'dagen' ? (
          <label className="flex items-center gap-1.5 text-sm text-vtk-muted">
            <span>{t.days}</span>
            <select
              value={days.length}
              onChange={(event) => router.push(hrefFor({ aantal: Number(event.target.value) }))}
              aria-label={t.dayCount}
              className="h-9 rounded-full border border-vtk-navy/15 bg-vtk-field px-3 text-sm text-vtk-ink"
            >
              {Array.from(
                { length: MAX_DAYS_COUNT - MIN_DAYS_COUNT + 1 },
                (_, index) => MIN_DAYS_COUNT + index
              ).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
        ) : null;
  // Wat er in een blok staat; naast de filters, want het is dezelfde soort vraag.
  const fieldPicker = <TripFieldPicker fields={fields} onChange={chooseFields} canShowDriver={showDriver} />;
  const zoomButtons = (
            <>
              <button
                type="button"
                onClick={() => zoomAround(zoom / ZOOM_STEP)}
                disabled={zoom <= ZOOM_MIN}
                title={t.zoomOutHint}
                className={iconButton}
              >
                <span aria-hidden className="text-base leading-none">−</span>
                <span className="sr-only">{t.zoomOut}</span>
              </button>
              {/* Het zoomniveau in woorden, want een knop die uitgrijst zonder
                  te zeggen waarom, leest als kapot. "Hele dag" is zoom 1: dan
                  past de dag exact en valt er niets meer uit te zoomen. */}
              {/* Een vaste breedte: "Hele dag" is breder dan "125%", en een
                  knop die bij elke zoomstap van breedte verandert, liet de hele
                  werkbalk herschikken. Op een venster van 1536px sprong ze dan van
                  twee rijen naar één en schoof de kalender 40px onder je muis. */}
              <button
                type="button"
                onClick={() => zoomAround(ZOOM_MIN)}
                disabled={zoom <= ZOOM_MIN}
                title={t.backToWholeDay}
                className="w-[5.5rem] rounded-full border border-vtk-navy/15 py-1 text-center text-xs font-medium tabular-nums text-vtk-ink transition-colors hover:border-vtk-navy/40 disabled:opacity-40"
              >
                {zoom <= ZOOM_MIN ? t.wholeDay : `${Math.round(zoom * 100)}%`}
              </button>
              <button
                type="button"
                onClick={() => zoomAround(zoom * ZOOM_STEP)}
                disabled={zoom >= ZOOM_MAX}
                title={t.zoomInHint}
                className={iconButton}
              >
                <span aria-hidden className="text-base leading-none">+</span>
                <span className="sr-only">{t.zoomIn}</span>
              </button>
            </>
  );
  // Op een telefoon is dit geen kijkinstelling maar de manier waarop
  // je deze kalender leest: volledig scherm geeft daar één dag over de
  // volle breedte, met vegen tussen de dagen en knijpen om de uren
  // groter te maken (zie `MobileCalendar`). Als naamloos icoontje
  // tussen twee andere icoontjes vond niemand dat, dus staat het er
  // met zijn naam. Op een laptop blijft het het icoontje rechts: daar
  // is de weekweergave zelf al leesbaar.
  const fullscreenButton = (
          <button
            type="button"
            onClick={toggleFullscreen}
            title={fullscreen ? t.fullscreenCloseEsc : t.fullscreen}
            aria-pressed={Boolean(fullscreen)}
            className={
              fullscreen
                ? 'grid h-8 w-8 place-items-center rounded-full border border-vtk-navy bg-vtk-navy text-vtk-on-emphasis transition'
                : narrow
                  ? 'inline-flex h-8 items-center gap-1.5 rounded-full border border-vtk-navy bg-vtk-navy px-3 text-sm font-semibold text-vtk-on-emphasis transition'
                  : iconButton
            }
          >
            <LogisticsIcon
              name={fullscreen ? 'collapse' : 'expand'}
              className="h-4 w-4"
            />
            {narrow && !fullscreen ? <span aria-hidden>{t.dayView}</span> : null}
            <span className="sr-only">
              {fullscreen ? t.fullscreenClose : narrow ? t.dayViewFullscreen : t.fullscreen}
            </span>
          </button>
  );

  // De knop Beschikbaarheid: aan of uit in één klik, met een schakelaartje dat
  // zegt in welke stand hij staat. Niet in de maandweergave: daar tekent de
  // kalender geen uren, en een knop die niets doet, leert mensen knoppen te
  // negeren. Op een telefoon enkel het icoon en de schakelaar; de naam blijft
  // voor de screenreader.
  const availabilityButton =
    availability && !asMonth ? (
      <button
        type="button"
        onClick={availability.onToggle}
        aria-pressed={availability.on}
        title={t.availabilityHint}
        className={`tg-avail-toggle${availability.on ? ' is-on' : ''}`}
      >
        <LogisticsIcon name="people" className="h-4 w-4 shrink-0" />
        <span className={narrow ? 'sr-only' : undefined}>{t.availability}</span>
        <span aria-hidden className="tg-switch" />
      </button>
    ) : null;

  return (
    <div ref={shell} className="transport-calendar grid gap-3" data-fullscreen={fullscreen || undefined}>
      {/* De kop en de werkbalk samen: in volledig scherm plakken ze samen bovenaan
          (zie `.transport-calendar-top` in planner.css). */}
      <div className="transport-calendar-top grid gap-3">
      {header}
      <div className="transport-calendar-toolbar relative flex flex-wrap items-center gap-2">
        {narrow ? (
          // Op een telefoon één rij (M2): wat de pagina zelf meegeeft (vooruit,
          // achteruit, een nieuwe rit) en de dagweergave; de kijkinstellingen
          // staan achter "Meer". Vier rijen knoppen duwden het rooster daar tot
          // halverwege het scherm.
          <>
            {toolbarExtra}
            {availabilityButton}
            {/* Het paneel hangt aan de werkbalk en niet aan de knop: waar "Meer"
                na het afbreken van de rij staat, verschilt per telefoon. */}
            <details>
              <summary className="cursor-pointer list-none rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-medium text-vtk-ink [&::-webkit-details-marker]:hidden">
                {t.menu}
              </summary>
              <div className="absolute left-0 top-full z-40 mt-2 grid w-[min(21rem,100%)] gap-3 rounded-[16px] border border-vtk-navy/15 bg-vtk-surface p-3 shadow-lg">
                {viewSegments}
                {daysSelect}
                {toolbarMenu}
                {fieldPicker}
                {asMonth ? null : <div className="flex items-center gap-1.5">{zoomButtons}</div>}
              </div>
            </details>
            <div className="ml-auto">{fullscreenButton}</div>
          </>
        ) : (
          <>
            {viewSegments}
            {daysSelect}
            {toolbarExtra}
            {availabilityButton}
            {toolbarMenu}
            {fieldPicker}
            {/* Zoom en volledig scherm helemaal rechts: het zijn kijkinstellingen en
                geen acties op de planning. In de maandweergave is de uurhoogte
                betekenisloos, dus daar staat de zoom er niet. */}
            <div className="ml-auto flex items-center gap-1.5">
              {asMonth ? null : zoomButtons}
              {fullscreenButton}
            </div>
          </>
        )}
      </div>
      </div>

      {asMonth ? (
        <MonthGrid
          days={days}
          anchor={anchor}
          focus={focus ?? null}
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
          fields={fields}
          driverColors={driverColors}
          zoom={zoom}
          scrollerRef={scroller}
          onMetrics={(value) => {
            metrics.current = value;
          }}
          now={now}
          onMoveBlock={onMoveBlock}
          onCreateRange={onCreateRange}
          draft={draft}
          bands={bands}
          bandsAs={bandsAs}
          nightFold={foldNight ? { open: nightOpen, onToggle: toggleNight } : undefined}
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
          voorstelt en waarom het gestreept is. Staat er nog geen voertuig klaar,
          dan valt de regel weg: een lege `ul` met gap laat enkel een
          onverklaarbaar gat tussen de kalender en wat eronder staat. */}
      {vehicles.length > 0 ? (
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
              <LogisticsIcon name={vehicleIconName(vehicle)} className="h-3.5 w-3.5 shrink-0" />
              {vehicle.name}
            </li>
          ))}
        </ul>
      ) : null}

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
  const t = useCalendarCopy();
  const buttonClass =
    'rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40';
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label={t.choose(label)}>
      <Link href={previousHref} className={buttonClass} title={t.previous(label)}>
        ← <span className="sr-only">{t.previous(label)}</span>
      </Link>
      <Link
        href={todayHref}
        aria-current={isToday ? 'true' : undefined}
        className={
          isToday
            ? 'rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 font-semibold text-vtk-on-emphasis'
            : buttonClass
        }
      >
        {t.today}
      </Link>
      <Link href={nextHref} className={buttonClass} title={t.next(label)}>
        → <span className="sr-only">{t.next(label)}</span>
      </Link>
    </nav>
  );
}
