'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AVAILABILITY_KIND_LABEL, availabilityFillClass } from '@/lib/availability-kinds';
import { driverColorVar, driverToneVar, type DriverColorOverrides } from '@/lib/driver-colors';
import { clockLabel } from '@/lib/quarter-time';
import { clashingWith } from '@/lib/transport-conflicts';
import { minutesOfDay, placeForDay, startOfBrusselsDay, type Placed } from '@/lib/week-lanes';
import { LogisticsIcon } from '@/components/logistics-icon';
import { BlockContent, blockLabel, blockLook, formatTime } from './trip-block';
import {
  DAY_HOURS,
  DEFAULT_TRIP_FIELDS,
  NIGHT_FOLD_END_HOUR,
  ZOOM_MIN,
  hourPxFor,
  laneBox,
  trackDriverOrder,
  trackGeometry,
  type AvailabilityBand,
  type CalendarVehicle,
  type TripBlock,
  type TripFields,
} from './types';
import { byLocale, useCalendarCopy } from './copy';

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

/** Vanaf wanneer een rit "overdag" is, voor waar de week opent (V2). */
const DAYTIME_FROM_MINUTES = 6 * 60;

const WEEKDAY = byLocale({ timeZone: 'Europe/Brussels', weekday: 'short' });
const DAY_OF_MONTH = byLocale({ timeZone: 'Europe/Brussels', day: 'numeric' });
const MONTH_SHORT = byLocale({ timeZone: 'Europe/Brussels', month: 'short' });
const FULL_DAY = byLocale({ timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long' });
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Het weekend krijgt een tint, zodat je de week leest zonder de namen te lezen. */
const weekdayKeyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const WEEKEND = new Set(['Sat', 'Sun']);

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
 * De volle breedte van datzelfde raster: de urenkolom, de dagkolommen op hun
 * minimum en de tussenruimtes ertussen. Zie `minWidth` in `TimeGrid` voor waar
 * dit voor dient.
 *
 * Een uitgerekende breedte en geen `min-width: max-content`: dat laatste laat
 * elke lange evenementnaam in de strook erboven de kolommen meerekken, en dan
 * wordt de week breder naarmate er een event met een lange naam in staat.
 *
 * Zonder tussenruimte: de dagen staan tegen elkaar met een haarlijn ertussen,
 * en de kop, de evenementen en de nacht gebruiken exact dezelfde kolommen.
 */
export function timeGridMinWidth(dayCount: number): string {
  return `calc(3.25rem + ${dayCount} * ${DAY_MIN_WIDTH})`;
}

/**
 * De stap waarop slepen vastklikt. Hetzelfde kwartier als de server aanvaardt
 * (`isOnQuarterHour`): kon je fijner slepen, dan bouwde je een rit die bij het
 * opslaan geweigerd wordt.
 */
const SNAP_MINUTES = 15;

/**
 * Hoeveel pixels aan de boven- of onderrand van een blok het begin- of einduur
 * verslepen in plaats van het blok.
 */
const RESIZE_GRIP_PX = 8;

/**
 * Vanaf welke hoogte een blok ook een greep aan de bovenrand krijgt.
 *
 * Een rit van een kwartier is 24 pixels hoog; met een greep boven én onder
 * blijft er dan acht pixels over om het blok zelf vast te pakken, en dan
 * verschuif je het einduur terwijl je de rit wou verplaatsen. Onder deze hoogte
 * is er dus enkel de onderrand, zoals in elke agenda-app.
 */
const TOP_GRIP_MIN_PX = 32;

/**
 * Hoeveel je moet bewegen voor een klik een sleep wordt. Zonder deze drempel
 * verschuift elke aanklik de rit een kwartier, want een muisklik beweegt altijd
 * een paar pixels.
 */
const DRAG_THRESHOLD_PX = 4;

/**
 * Hoe dicht bij de rand van het rooster het mee begint te schuiven tijdens een
 * sleep, en hoe snel op zijn snelst (pixels per beeld).
 *
 * Ingezoomd staat maar een stuk van de dag in beeld, en zonder dit kon je een
 * rit niet verder rekken of verslepen dan wat je zag: loslaten, scrollen,
 * opnieuw vastpakken. Hoe dichter bij de rand, hoe sneller, zoals in elke
 * agenda-app; zo kan je zowel een kwartier bijsturen als een halve dag oversteken.
 */
const EDGE_PX = 40;
const EDGE_SPEED_PX = 16;

function edgeSpeed(depth: number): number {
  if (depth <= 0) return 0;
  return Math.ceil(Math.min(1, depth / EDGE_PX) * EDGE_SPEED_PX);
}

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

/** Begin en einde zoals ze stonden voor de sleep, in milliseconden. */
type Origin = { start: number; end: number };

type DragState =
  | {
      kind: 'move';
      blockId: string;
      dayIndex: number;
      from: number;
      to: number;
      grabOffset: number;
      origin: Origin;
    }
  | {
      kind: 'resize';
      /** Een rit of een beschikbaarheidsvenster: elk heeft zijn eigen callback. */
      target: 'block' | 'band';
      id: string;
      /** Welke rand je vastpakte: het beginuur of het einduur. */
      edge: 'start' | 'end';
      dayIndex: number;
      from: number;
      to: number;
      /** De rand die blijft staan, als moment; zie `dragRange`. */
      fixed: number;
      origin: Origin;
      /** De baan van het blok, zodat de schaduw even breed is als wat je rekt. */
      lane: number;
      lanes: number;
    }
  | {
      kind: 'create';
      dayIndex: number;
      from: number;
      to: number;
      /**
       * De eigen band waarin de sleep begon, of niets op lege ruimte. Wordt het
       * geen sleep maar een klik, dan opent die band haar menuutje.
       */
      bandId?: string;
    };

/**
 * Begin en einde van wat er versleept wordt, als echte momenten.
 *
 * Bij het rekken blijft één rand staan, en die hoeft niet op de dag te liggen
 * waarin je trekt: het einde van een rit van 22:00 tot 02:00 rek je in de kolom
 * van de ochtend erna, terwijl haar begin de avond ervoor ligt. Die rand ligt
 * daarom vast als moment en niet als minuten in deze kolom.
 */
function dragRange(drag: DragState, day: Date): { start: Date; end: Date } {
  if (drag.kind === 'resize') {
    return drag.edge === 'start'
      ? { start: momentOn(day, drag.from), end: new Date(drag.fixed) }
      : { start: new Date(drag.fixed), end: momentOn(day, drag.to) };
  }
  return {
    start: momentOn(day, Math.min(drag.from, drag.to)),
    end: momentOn(day, Math.max(drag.from, drag.to)),
  };
}

/** Het id van de rit of het venster dat versleept wordt, of niets bij een nieuwe selectie. */
function draggedId(drag: DragState): string | null {
  if (drag.kind === 'move') return drag.blockId;
  if (drag.kind === 'resize') return drag.id;
  return null;
}

export function TimeGrid({
  days,
  vehicles,
  blocks,
  onSelect,
  selectedId,
  emptyLabel,
  showDriver = true,
  fields = DEFAULT_TRIP_FIELDS,
  driverColors,
  zoom = ZOOM_MIN,
  onMetrics,
  scrollerRef,
  now,
  onMoveBlock,
  onCreateRange,
  onResizeBand,
  onSelectBand,
  above,
  bands,
  bandsProminent = false,
  bandsAs = 'background',
  draft,
  dayStartHour = 0,
  nightFold,
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
  /** Welke regels er in een blok staan (R7); weglaten geeft de standaardweergave. */
  fields?: TripFields;
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
   * Een rit verslepen, of aan de boven- of onderrand rekken (P4). Weglaten maakt
   * de kalender onbeweeglijk, wat het publieke overzicht ook is.
   */
  onMoveBlock?: (blockId: string, startAt: Date, endAt: Date) => void;
  /** Slepen op lege ruimte: een nieuwe rit op dat moment. */
  onCreateRange?: (startAt: Date, endAt: Date) => void;
  /**
   * Een band aan haar boven- of onderrand rekken: je eigen beschikbaarheid
   * korter of langer maken.
   *
   * Enkel op je eigen beschikbaarheidsscherm. In de planning zijn de banden de
   * vensters van iemand anders, en die verzet het team niet voor hem. Het
   * midden van een band blijft daarbij doen wat het deed: een sleep die daar
   * begint, tekent of wist zoals een sleep op lege ruimte (`onCreateRange`).
   */
  onResizeBand?: (bandId: string, startAt: Date, endAt: Date) => void;
  /**
   * Een eigen band aanklikken zonder te slepen: het scherm opent er een
   * menuutje bij, en `anchor` zegt waar de band staat. Enkel samen met
   * `onResizeBand`, want enkel dan vangt een band de muis.
   */
  onSelectBand?: (bandId: string, anchor: DOMRect) => void;
  /**
   * Wat er boven de dagkoppen komt (de evenementenstrook, P5). Binnen dezelfde
   * scroller, zodat het meeschuift met de dagen eronder.
   */
  above?: ReactNode;
  /** Beschikbaarheidsvensters als band achter het rooster (V1). */
  bands?: AvailabilityBand[];
  /**
   * De rit die je aan het aanmaken bent, zolang het formulier openstaat.
   *
   * Blijft als grijs blok op het rooster staan. Zonder dit verdween je selectie
   * op het moment dat je ze ging invullen: het sleepblok is er enkel tijdens het
   * slepen, en daarna stond je in een formulier zonder te zien waar de rit komt.
   */
  draft?: { startAt: string; endAt: string } | null;
  /**
   * De banden op de voorgrond in plaats van als context erachter.
   *
   * In de planning zijn ze bewust vaag: het is de achtergrond waarbinnen je
   * plant, en ze mogen niet met de ritten concurreren om je aandacht. Op je eigen
   * beschikbaarheidsscherm staan er helemaal geen ritten en zijn die banden het
   * enige wat er te zien is; vaag betekent daar "ik zie niet goed wat ik net
   * aangeduid heb".
   */
  bandsProminent?: boolean;
  /**
   * Hoe de banden er staan (niet op je eigen beschikbaarheidsscherm, dat
   * `bandsProminent` gebruikt).
   *
   * - `background`: een lichte band over de hele kolom, achter de ritten. Van
   *   vier mensen die kunnen, zie je zo één gearceerd blok.
   * - `tracks`: één smal spoor per chauffeur links in elke kolom, in zijn kleur,
   *   met de ritten ernaast. Zo zie je wíé er kan, en is het een knop in de
   *   planning in plaats van een filter (zie de knop Beschikbaarheid).
   */
  bandsAs?: 'background' | 'tracks';
  /**
   * De nacht (00:00 tot `NIGHT_FOLD_END_HOUR`) als strook in plaats van zes uur
   * rooster, met een knop om ze open te klappen. Enkel met `dayStartHour` 0.
   * Weglaten toont de hele dag, zoals op het bezettingsoverzicht.
   */
  nightFold?: { open: boolean; onToggle: () => void };
  /**
   * Vanaf welk uur een dagkolom begint (F4.2).
   *
   * De planning laat dit op 0: een rit om 02:00 staat op de datum waarop hij
   * rijdt. Het beschikbaarheidsscherm zet het op `DAG_START_UUR` (5), zodat de
   * zaterdagkolom doorloopt tot zondagochtend 05:00 en je van 22:00 naar 02:00
   * kan slepen zonder van kolom te wisselen. De kolom toont dan onderaan de uren
   * 00 tot 04 van de dag erna.
   */
  dayStartHour?: number;
}) {
  const t = useCalendarCopy();
  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles]
  );

  const placedPerDay = useMemo(
    () => parsedDays.map((day) => placeForDay(blocks, day, dayStartHour * 60)),
    [blocks, dayStartHour, parsedDays]
  );

  /**
   * Het ontwerp op zijn plek, per dag. Via dezelfde `placeForDay` als de ritten,
   * zodat een selectie over middernacht ook op twee dagen klopt in plaats van
   * een blok met negatieve hoogte te geven.
   */
  const draftPerDay = useMemo(
    () =>
      draft
        ? parsedDays.map(
            (day) =>
              placeForDay(
                [{ id: 'draft', startAt: draft.startAt, endAt: draft.endAt }],
                day,
                dayStartHour * 60
              )[0] ?? null
          )
        : parsedDays.map(() => null),
    [dayStartHour, draft, parsedDays]
  );

  // Dezelfde dagknip als de ritten, zodat een venster van 22:00 tot 02:00 ook op
  // twee dagen staat en niet op één met een negatieve hoogte.
  const bandsPerDay = useMemo(
    () => parsedDays.map((day) => (bands ? placeForDay(bands, day, dayStartHour * 60) : [])),
    [bands, dayStartHour, parsedDays]
  );

  // De kalender toont altijd de hele dag, en die is altijd vierentwintig uur
  // lang; enkel wáár ze begint verschilt (zie `dayStartHour`). De blokken
  // gebruiken `firstHour` als nulpunt, dus op het beschikbaarheidsscherm lopen
  // de uren van 5 tot 29 en staat er onderaan 04:00 van de ochtend erna.
  //
  // Met de nacht ingeklapt (`nightFold`) begint het rooster om 06:00; wat ervoor
  // valt, staat als pil in de strook in de kop. De dag is dan nog altijd heel,
  // enkel anders verdeeld.
  const folded = Boolean(nightFold && !nightFold.open && dayStartHour === 0);
  const firstHour = folded ? NIGHT_FOLD_END_HOUR : dayStartHour;
  const lastHour = folded ? DAY_HOURS : dayStartHour + DAY_HOURS;
  const visibleHours = lastHour - firstHour;

  /**
   * Wat er in het rooster staat: alles wat na het eerste getoonde uur eindigt,
   * afgeknipt op dat uur. Een afgeknipt blok krijgt `continuesBefore`, met
   * dezelfde gevolgen als een rit van gisteren: een pijl voor het uur, niet te
   * verslepen (je ziet niet de hele rit) en geen greep aan de bovenrand.
   */
  const gridPerDay = useMemo(
    () =>
      placedPerDay.map((day) =>
        day
          .filter((block) => block.to > firstHour * 60)
          .map((block) =>
            block.from < firstHour * 60
              ? { ...block, from: firstHour * 60, continuesBefore: true }
              : block
          )
      ),
    [firstHour, placedPerDay]
  );

  /** De ritten die (ook) in de ingeklapte nacht vallen, als pil in de strook. */
  const nightPerDay = useMemo(
    () =>
      placedPerDay.map((day) => (folded ? day.filter((block) => block.from < firstHour * 60) : [])),
    [firstHour, folded, placedPerDay]
  );

  /**
   * De sporen van de beschikbaarheid (`bandsAs="tracks"`): wie welk spoor krijgt,
   * en wat ze samen links van elke kolom innemen. Zonder banden is dat niets, en
   * staan de ritten waar ze altijd stonden.
   */
  const tracks = bandsAs === 'tracks' && !bandsProminent && bands && bands.length > 0;
  const trackOrder = useMemo(() => (tracks && bands ? trackDriverOrder(bands) : []), [bands, tracks]);
  const trackShape = trackGeometry(trackOrder.length);

  /**
   * De uurhoogte waarbij de hele dag precies in de pane past, gemeten aan de
   * scroller zelf. Een `ResizeObserver` en geen `window.resize`: de pane
   * verandert ook van hoogte wanneer de evenementenstrook groeit of wanneer je
   * in volledig scherm gaat, en daar komt geen vensterwijziging aan te pas.
   */
  const innerScroller = useRef<HTMLDivElement | null>(null);
  const scroller = scrollerRef ?? innerScroller;
  const head = useRef<HTMLDivElement | null>(null);
  const hourColumn = useRef<HTMLDivElement | null>(null);
  const [paneHeight, setPaneHeight] = useState(0);
  const [headHeight, setHeadHeight] = useState(0);

  // Een layout-effect en geen gewoon effect: de eerste meting moet er staan
  // vóór de browser schildert. Met een gewoon effect tekende de kalender eerst
  // met een gegokte hoogte (640px) en verschoof daarna alles naar de echte; dat
  // was een van de sprongen bij het openen.
  useLayoutEffect(() => {
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
    // Alles in layout-pixels. `getBoundingClientRect` geeft onder de 90%-zoom van
    // de site (laptops, zie vtk-base.css) visuele pixels terwijl `offsetHeight`
    // layout-pixels geeft; ze mengen liet "hele dag" 10% van de pane onbenut
    // (F6.2). `clientHeight` is layout, mét padding, en die gaat er hier af.
    const measure = () => {
      setPaneHeight(node.clientHeight - paddingOf(node));
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
  // Gedeeld door de uren die er staan: met de nacht ingeklapt zijn dat er
  // achttien, en "hele dag" is dan 06:00 tot 24:00 zonder scrollen.
  const fitHourPx = usable / visibleHours;
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
  // In een layout-effect, ná de meting hierboven: dan staat het rooster al op
  // zijn echte hoogte en kan de scroll meteen goed, vóór er iets geschilderd
  // is. Het waren twee `requestAnimationFrame`s, en die maakten het zichtbaar:
  // de week verscheen eerst op 00:00 en sprong dan naar de eerste rit, ook bij
  // elke klik op vorige of volgende week.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || paneHeight === 0) return;
    const key = days.join('|');
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;

    // De eerste rit overdag (V2). Een nachtrit (de terugrit van een fuif om
    // 01:00) trok anders de hele week naar middernacht, en dan opende de
    // planning op tien lege nachturen. Zonder rit overdag: 07:00.
    //
    // "Overdag" is vanaf 06:00 na het begin van de kolom, en nooit vóór het
    // eerste uur dat er staat: met de nacht ingeklapt begint het rooster zelf om
    // 06:00, en op "hele dag" valt er dan niets te scrollen.
    const daytime = Math.max(firstHour * 60, dayStartHour * 60 + DAYTIME_FROM_MINUTES);
    let earliest = 8 * 60;
    for (const day of gridPerDay) {
      for (const block of day) {
        if (block.from >= daytime) earliest = Math.min(earliest, block.from);
      }
    }
    // Gerekend vanaf het eerste uur van de kolom, niet vanaf middernacht: op het
    // beschikbaarheidsscherm begint de kolom om 05:00, en dan scrolde dit vijf
    // uur te ver.
    const target = Math.max(0, ((earliest - firstHour * 60) / 60 - 1) * hourPx);
    node.scrollTop = Math.min(target, Math.max(0, node.scrollHeight - node.clientHeight));
  }, [dayStartHour, days, firstHour, gridPerDay, hourPx, paneHeight, scroller]);

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
  const grabbedAt = useRef({ x: 0, y: 0 });
  /** De band waarin een sleep begon, om haar menuutje bij een klik naast te zetten. */
  const pressedBand = useRef<HTMLElement | null>(null);
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
   * De dagkolom onder de muis, of de dichtstbijzijnde. Een rit sleep je zo naar
   * een andere dag: ze bleef vroeger in haar eigen kolom, en wie haar naar
   * donderdag wou, moest het uur in het paneel gaan intikken.
   */
  const dayIndexAt = useCallback((clientX: number, fallback: number): number => {
    let best = fallback;
    let bestDistance = Infinity;
    columns_.current.forEach((node, index) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const distance =
        clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  }, []);

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

  const listen = useCallback(
    (cursor: string) => {
      /** Waar de muis het laatst stond; ook het automatisch scrollen rekent daarmee. */
      let pointer = { ...grabbedAt.current };
      let frame = 0;

      /** De sleep bijwerken naar waar de muis nu staat, in de kolom die er nu staat. */
      function update(force = false) {
        const current = dragRef.current;
        if (!current) return;
        // Enkel verplaatsen gaat over de dagen heen. Rekken en tekenen blijven in
        // hun kolom: een venster dat je aan zijn onderrand rekt, hoort niet
        // ineens op woensdag te beginnen.
        const dayIndex =
          current.kind === 'move' ? dayIndexAt(pointer.x, current.dayIndex) : current.dayIndex;
        const minutes = snap(minutesAt(dayIndex, pointer.y));
        let next: DragState;
        if (current.kind === 'resize') {
          // De rand stopt een kwartier voor de andere: een rit van nul minuten
          // of een die eindigt voor ze begint, bestaat niet.
          next =
            current.edge === 'end'
              ? { ...current, to: Math.max(current.from + SNAP_MINUTES, minutes) }
              : { ...current, from: Math.min(current.to - SNAP_MINUTES, minutes) };
        } else if (current.kind === 'create') {
          next = { ...current, to: minutes };
        } else {
          const length = current.to - current.from;
          const from = Math.max(firstHour * 60, minutes - current.grabOffset);
          next = { ...current, dayIndex, from, to: from + length };
        }
        // Niet bij elke pixel opnieuw tekenen: enkel wanneer het kwartier of de
        // dag verandert. Het scrollen hieronder roept dit zestig keer per seconde.
        if (
          !force &&
          next.dayIndex === current.dayIndex &&
          next.from === current.from &&
          next.to === current.to
        ) {
          return;
        }
        dragRef.current = next;
        setDrag(next);
      }

      function onMove(event: PointerEvent) {
        if (!dragRef.current) return;
        pointer = { x: event.clientX, y: event.clientY };
        // Een muisklik beweegt altijd een paar pixels; zonder drempel verschuift
        // elke aanklik de rit een kwartier. In beide richtingen, want een rit
        // die je recht naar de volgende dag schuift, beweegt niet verticaal.
        if (!moved.current) {
          const distance = Math.hypot(
            event.clientX - grabbedAt.current.x,
            event.clientY - grabbedAt.current.y
          );
          if (distance < DRAG_THRESHOLD_PX) return;
          moved.current = true;
          frame = requestAnimationFrame(scrollAtEdge);
          update(true);
          return;
        }
        update();
      }

      /**
       * Mee scrollen zolang de muis tegen een rand van het rooster hangt. De
       * bovenrand is de onderkant van de vastgeplakte kop, niet die van de pane:
       * daaronder begint de dag. Horizontaal enkel bij verplaatsen, want enkel
       * dat gaat naar een andere dag.
       *
       * Kan de pane niet verder en loopt ze buiten het venster, dan schuift de
       * pagina: op het beschikbaarheidsscherm staat de onderkant van de week
       * soms onder de vouw.
       */
      function scrollAtEdge() {
        const node = scroller.current;
        const current = dragRef.current;
        if (node && current) {
          const rect = node.getBoundingClientRect();
          const top = Math.max(head.current?.getBoundingClientRect().bottom ?? rect.top, 0);
          const bottom = Math.min(rect.bottom, window.innerHeight);
          const dy =
            pointer.y < top + EDGE_PX
              ? -edgeSpeed(top + EDGE_PX - pointer.y)
              : edgeSpeed(pointer.y - (bottom - EDGE_PX));
          let dx = 0;
          if (current.kind === 'move') {
            const left = Math.max(hourColumn.current?.getBoundingClientRect().right ?? rect.left, 0);
            const right = Math.min(rect.right, window.innerWidth);
            dx =
              pointer.x < left + EDGE_PX
                ? -edgeSpeed(left + EDGE_PX - pointer.x)
                : edgeSpeed(pointer.x - (right - EDGE_PX));
          }
          if (dx !== 0 || dy !== 0) {
            const before = { top: node.scrollTop, left: node.scrollLeft };
            node.scrollTop += dy;
            node.scrollLeft += dx;
            if (
              node.scrollTop === before.top &&
              ((dy > 0 && rect.bottom > window.innerHeight) || (dy < 0 && rect.top < 0))
            ) {
              window.scrollBy(0, dy);
            }
            update();
          }
        }
        frame = requestAnimationFrame(scrollAtEdge);
      }

      /** Stoppen zonder iets te bewaren: bij Escape, en na het loslaten. */
      function end(): DragState | null {
        detach();
        const current = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        // Het loslaten is óók een klik op de rit; die mag het paneel niet openen.
        if (current?.kind === 'move' || (current?.kind === 'resize' && current.target === 'block')) {
          if (moved.current) justDraggedId.current = draggedId(current);
        }
        return current;
      }

      function onUp() {
        const current = end();
        if (!current) return;
        if (!moved.current) {
          // Een klik op je eigen band, geen sleep: haar menuutje.
          if (current.kind === 'create' && current.bandId && pressedBand.current) {
            onSelectBand?.(current.bandId, pressedBand.current.getBoundingClientRect());
          }
          return;
        }
        const { start, end: until } = dragRange(current, parsedDays[current.dayIndex]);
        if (until.getTime() - start.getTime() < SNAP_MINUTES * 60_000) return;
        if (current.kind === 'create') {
          onCreateRange?.(start, until);
          return;
        }
        // Teruggezet waar het stond: niets te bewaren. Anders vertrekt er een
        // verzoek dat met "Niets gewijzigd" terugkomt.
        if (start.getTime() === current.origin.start && until.getTime() === current.origin.end) {
          return;
        }
        if (current.kind === 'resize' && current.target === 'band') {
          onResizeBand?.(current.id, start, until);
        } else {
          onMoveBlock?.(draggedId(current) as string, start, until);
        }
      }

      // Escape breekt af, zoals in elke agenda: wie halverwege ziet dat het de
      // verkeerde rit is, moest anders terugslepen tot op het kwartier.
      function onKey(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        end();
      }

      function detach() {
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKey);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        stopDrag.current = null;
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKey);
      // De cursor op de hele pagina, zolang je sleept: de greep is acht pixels
      // hoog en je muis verlaat ze meteen, en dan sprong de cursor terug naar
      // een pijl terwijl je nog aan het rekken was. `user-select` om dezelfde
      // reden: wie over de dagkop heen sleept, selecteerde die tekst.
      document.body.style.setProperty('cursor', cursor);
      document.body.style.setProperty('user-select', 'none');
      stopDrag.current = detach;
    },
    [
      dayIndexAt,
      firstHour,
      minutesAt,
      onCreateRange,
      onMoveBlock,
      onResizeBand,
      onSelectBand,
      parsedDays,
      scroller,
    ]
  );

  /**
   * Hoe het origineel er tijdens een sleep uitziet. Bij verplaatsen blijft het
   * vaag op zijn oude plek staan, zodat je ziet waar het vandaan komt. Bij rekken
   * verdwijnt het in de kolom waarin je trekt, want daar ís de schaduw het blok:
   * met allebei zichtbaar stonden het oude en het nieuwe uur over elkaar.
   */
  function draggedOpacity(id: string, dayIndex: number): number | undefined {
    if (!drag || !moved.current || draggedId(drag) !== id) return undefined;
    return drag.kind === 'resize' && drag.dayIndex === dayIndex ? 0 : 0.4;
  }

  function startDrag(next: DragState, event: React.PointerEvent, cursor: string) {
    moved.current = false;
    grabbedAt.current = { x: event.clientX, y: event.clientY };
    dragRef.current = next;
    setDrag(next);
    listen(cursor);
  }

  function beginMove(event: React.PointerEvent, block: Placed<TripBlock>, dayIndex: number) {
    if (!onMoveBlock || event.pointerType !== 'mouse' || event.button !== 0) return;
    // Een rit die over de dagrand loopt, versleep je niet vanuit deze dag: het
    // stuk dat je ziet is niet de hele rit, en verschuiven zou het andere stuk
    // laten verspringen zonder dat je het ziet. Rekken mag wel (`beginResize`):
    // daar blijft het andere stuk staan.
    if (block.continuesBefore || block.continuesAfter) return;
    event.stopPropagation();
    const at = snap(minutesAt(dayIndex, event.clientY));
    startDrag(
      {
        kind: 'move',
        blockId: block.id,
        dayIndex,
        from: block.from,
        to: block.to,
        grabOffset: at - block.from,
        origin: { start: block.start.getTime(), end: block.end.getTime() },
      },
      event,
      'grabbing'
    );
  }

  /**
   * Een rand vastpakken: het beginuur aan de bovenrand, het einduur aan de
   * onderrand. Voor ritten en voor je eigen beschikbaarheid hetzelfde gebaar.
   */
  function beginResize(
    event: React.PointerEvent,
    target: 'block' | 'band',
    item: Placed<{ id: string; startAt: string; endAt: string }>,
    dayIndex: number,
    edge: 'start' | 'end'
  ) {
    const enabled = target === 'block' ? onMoveBlock : onResizeBand;
    if (!enabled || event.pointerType !== 'mouse' || event.button !== 0) return;
    // Enkel de rand die op deze dag ligt. Van een rit die gisteren begon, is de
    // bovenrand hier de middernachtlijn en niet haar beginuur.
    if (edge === 'start' ? item.continuesBefore : item.continuesAfter) return;
    event.stopPropagation();
    startDrag(
      {
        kind: 'resize',
        target,
        id: item.id,
        edge,
        dayIndex,
        from: item.from,
        to: item.to,
        fixed: (edge === 'start' ? item.end : item.start).getTime(),
        origin: { start: item.start.getTime(), end: item.end.getTime() },
        lane: item.lane,
        lanes: item.lanes,
      },
      event,
      'ns-resize'
    );
  }

  /**
   * Slepen op lege ruimte. `bandId` wanneer de sleep in het midden van een eigen
   * band begint: die vangt de muis om haar randen te kunnen tonen, maar haar
   * midden hoort te doen wat de kolom doet. Blijft het bij een klik, dan opent
   * die band haar menuutje (`onSelectBand`).
   */
  function beginCreate(event: React.PointerEvent, dayIndex: number, bandId?: string) {
    if (!onCreateRange || event.pointerType !== 'mouse' || event.button !== 0) return;
    if (!bandId && event.target !== event.currentTarget) return;
    event.stopPropagation();
    pressedBand.current = bandId ? (event.currentTarget as HTMLElement) : null;
    const at = snap(minutesAt(dayIndex, event.clientY));
    startDrag({ kind: 'create', dayIndex, from: at, to: at + 60, bandId }, event, 'copy');
  }

  /**
   * De rit waarmee de versleepte rit op haar nieuwe plek zou botsen: hetzelfde
   * voertuig, op hetzelfde moment. De schaduw wordt dan rood terwijl je nog
   * sleept, in plaats van dat je het pas na het loslaten aan twee rode blokken
   * ziet. Enkel wat er in beeld staat telt mee; staat een voertuig weggefilterd,
   * dan zegt de server het na het loslaten alsnog.
   */
  const clash = useMemo(() => {
    if (!drag || drag.kind === 'create' || (drag.kind === 'resize' && drag.target === 'band')) {
      return null;
    }
    const id = draggedId(drag);
    const block = blocks.find((entry) => entry.id === id);
    if (!block) return null;
    const { start, end } = dragRange(drag, parsedDays[drag.dayIndex]);
    const [first] = clashingWith(
      { id: block.id, vehicleId: block.vehicleId, status: block.status, startAt: start, endAt: end },
      blocks.map((entry) => ({
        id: entry.id,
        vehicleId: entry.vehicleId,
        status: entry.status,
        startAt: new Date(entry.startAt),
        endAt: new Date(entry.endAt),
      }))
    );
    return first ? (blocks.find((entry) => entry.id === first.id) ?? null) : null;
  }, [blocks, drag, parsedDays]);

  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  const height = hours.length * hourPx;
  const columns = timeGridColumns(parsedDays.length);
  /**
   * De kop en het rooster krijgen allebei deze breedte, en dat is wat de
   * urenkolom links laat plakken tot en met zondag.
   *
   * `position: sticky` plakt binnen zijn **ouder** en niet binnen de scroller.
   * Een raster met `1fr`-kolommen is als doos precies zo breed als het
   * scrollvenster terwijl zijn kolommen eroverheen lopen; scrolde je voorbij die
   * rand, dan liep de urenkolom tegen de grens van haar ouder en schoof ze
   * alsnog uit beeld. Dezelfde breedte op de kop houdt daarbij de dagnamen
   * doorlopend: anders bleef er rechts een onbeschilderde strook waar de ritten
   * doorheen schoven.
   *
   * Eén uitgerekende waarde op twee zusters en geen doos eromheen: zo blijven
   * ze exact even breed zonder dat er een laag bijkomt tussen de `sticky` kop en
   * haar scroller.
   */
  const minWidth = timeGridMinWidth(parsedDays.length);

  // "Vandaag" is de dag waar dit uur bij hoort, en dat is met een verschoven
  // dagrand niet dezelfde als de datum: om 02:00 sta je nog in de kolom van
  // gisteren. Bij een dagrand op middernacht valt dit allebei terug op wat het
  // was.
  const todayKey = now
    ? dayKeyFormatter.format(new Date(now.getTime() - dayStartHour * 60 * 60 * 1000))
    : null;
  const nowRaw = now ? minutesOfDay(now) : 0;
  const nowMinutes = nowRaw < firstHour * 60 ? nowRaw + DAY_HOURS * 60 : nowRaw;
  const nowShown =
    todayKey !== null &&
    parsedDays.some((day) => dayKeyFormatter.format(day) === todayKey) &&
    nowMinutes >= firstHour * 60 &&
    nowMinutes <= lastHour * 60;

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
    //
    // `data-inspector-host`: hier hangt het kaartje van een evenement of een
    // nachtrit aan (zie `TripInspector`). Die staan in de vastgeplakte kop, dus
    // ten opzichte van de pane bewegen ze niet wanneer de uren scrollen.
    <div
      data-inspector-host="pane"
      className="tg-pane relative rounded-[16px] border border-vtk-navy/10 bg-vtk-surface"
    >
      {/* Geen `padding-top` op de scroller. Een `sticky top-0`-kop plakt aan de
          bovenrand van het scrollvenster, niet onder de padding: die acht pixels
          bleven dus onbedekt, en daar schoven de ritten doorheen boven de
          dagnamen. Dat is wat er "los" uitzag. De lucht bovenaan zit nu in de
          kop zelf, die meeschuift en alles eronder afdekt. */}
      <div
        ref={scroller}
        className="tg-scroller relative h-full overflow-auto pb-2 pr-2"
        // De hoogte van de vastgeplakte kop, voor `scroll-margin-top`: wie naar
        // een rit springt, landt er niet onder (zie planner.css).
        style={{ '--tg-head-h': `${headHeight}px` } as React.CSSProperties}
      >
        {/* De kop plakt bovenaan de scroller: de dagen en de evenementenstrook
            blijven staan terwijl je door de uren scrolt. Eén `sticky` blok en
            niet twee, want twee sticky elementen met een eigen `top` schuiven
            over elkaar zodra de strook van hoogte verandert.

            De hairline eronder is niet decoratief: zonder rand loopt wit vlak
            over in wit vlak en lijkt de rij dagnamen boven het rooster te
            zweven in plaats van erop te staan. */}
        <div
          ref={head}
          className="tg-head sticky top-0 z-30 border-b border-vtk-navy/10 bg-vtk-surface"
          style={{ minWidth }}
        >
          {/* De dagen eerst, dan de evenementen, dan de nacht: van de rij die
              zegt welke kolom welke dag is, naar wat er die dag speelt, naar het
              rooster. Zo staat de dagnaam recht boven zijn kolom, zoals in elke
              agenda, en niet boven een rij evenementen. */}
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            {/* De hoek linksboven. Dezelfde rand als de urenkolom eronder,
                anders breekt de scheidingslijn af ter hoogte van de kop. Met de
                nacht open staat hier de knop om ze weer in te klappen; dicht
                staat die knop in de strook zelf, bij de nacht waar hij over gaat. */}
            <span className="sticky left-0 z-20 flex items-end justify-center border-r border-vtk-navy/10 bg-vtk-surface pb-1.5">
              {nightFold && dayStartHour === 0 && nightFold.open ? (
                <button
                  type="button"
                  onClick={nightFold.onToggle}
                  aria-expanded
                  title={t.nightHide}
                  className="tg-night-toggle"
                >
                  <LogisticsIcon name="moon" className="h-4 w-4" />
                  <span className="sr-only">{t.nightHide}</span>
                </button>
              ) : null}
            </span>
            {parsedDays.map((day, index) => {
              const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
              const dayNumber = DAY_OF_MONTH[t.locale].format(day);
              // De maand bij de eerste kolom en op de eerste van een maand:
              // "komende dagen" loopt soms over een maandgrens, en dan is "1"
              // zonder maand een raadsel.
              const showMonth = index === 0 || dayNumber === '1';
              const count = bandsProminent
                ? null
                : placedPerDay[index].filter((block) => !block.continuesBefore).length;
              return (
                <span
                  key={days[index]}
                  className={`tg-dayhead${isToday ? ' is-today' : ''}`}
                  title={FULL_DAY[t.locale].format(day)}
                >
                  <span className="tg-dayhead-name">{WEEKDAY[t.locale].format(day)}</span>
                  <span className="tg-dayhead-num">{dayNumber}</span>
                  {showMonth ? (
                    <span className="tg-dayhead-month">{MONTH_SHORT[t.locale].format(day)}</span>
                  ) : null}
                  {count !== null ? <span className="tg-dayhead-count">{t.tripCount(count)}</span> : null}
                </span>
              );
            })}
          </div>

          {above}

          {/* De ingeklapte nacht: één strook met de ritten van 00:00 tot 06:00
              als pil. Een pil opent de rit zoals een blok; slepen kan hier niet,
              daarvoor klap je de nacht open. */}
          {folded ? (
            <div
              className="grid border-t border-vtk-navy/10 bg-vtk-paper/60"
              style={{ gridTemplateColumns: columns }}
            >
              <span className="sticky left-0 z-20 border-r border-vtk-navy/10 bg-vtk-paper">
                <button
                  type="button"
                  onClick={nightFold?.onToggle}
                  aria-expanded={false}
                  title={t.nightShow}
                  className="tg-night-label"
                >
                  <LogisticsIcon name="moon" className="h-3.5 w-3.5 shrink-0" />
                  <span aria-hidden>00-{String(NIGHT_FOLD_END_HOUR).padStart(2, '0')}</span>
                  <span className="sr-only">{t.nightShow}</span>
                </button>
              </span>
              {parsedDays.map((day, index) => {
                const draftPiece = draftPerDay[index];
                return (
                  <div key={days[index]} className="tg-night-cell">
                    {nightPerDay[index].map((block) => (
                      <NightPill
                        key={`${block.id}-${days[index]}`}
                        block={block}
                        vehicle={vehicleById.get(block.vehicleId) ?? null}
                        onSelect={onSelect}
                        selected={selectedId === block.id}
                        showDriver={showDriver}
                        driverColors={driverColors}
                      />
                    ))}
                    {draftPiece && draftPiece.from < firstHour * 60 ? (
                      <span aria-hidden className="trip-draft tg-night-pill tabular-nums">
                        {formatTime(momentOn(day, draftPiece.from))}-
                        {formatTime(momentOn(day, draftPiece.to))}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Ook de banden tellen mee voor "leeg": op het
              beschikbaarheidsscherm staan er nooit ritten, en dan bleef er
              "sleep hieronder in de week" staan boven een week die al vol
              stond.

              Over het rooster en niet als regel in de kop. Als regel verdween
              ze bij je eerste venster, en dan schoof de hele week 25 pixels
              omhoog onder je muis, net wanneer je een tweede wou tekenen. Ze
              hangt aan de kop, zodat ze zichtbaar blijft terwijl je scrolt, en
              laat de muis door naar de dag eronder. */}
          {blocks.length === 0 && (bands?.length ?? 0) === 0 ? (
            <p className="pointer-events-none absolute left-[3.75rem] right-2 top-full z-10 mt-2">
              <span className="inline-block rounded-full border border-vtk-navy/10 bg-vtk-surface px-3 py-1 text-xs text-vtk-muted shadow-sm">
                {emptyLabel}
              </span>
            </p>
          ) : null}

        </div>

        {/* `data-inspector-host="grid"`: het kaartje van een rit wordt hierin
            gezet (zie `TripInspector`), zodat het mee scrolt met zijn blok
            zonder dat JavaScript het bij elke scroll moet verplaatsen. Dat
            verplaatsen liep een beeld achter, en dan beefde het kaartje naast
            zijn blok. */}
        <div
          data-inspector-host="grid"
          className="relative grid"
          style={{ gridTemplateColumns: columns, minWidth }}
        >
          {/* De urenkolom, vastgeplakt links: scrol je horizontaal door de week,
              dan blijft de klok staan waar ze hoort. */}
          <div
            ref={hourColumn}
            className="sticky left-0 z-20 border-r border-vtk-navy/10 bg-vtk-surface"
            style={{ height }}
          >
            <div className="relative h-full">
              {/* Het uur van nu als pil in de urenkolom, op de hoogte van de
                  rode lijn: zo lees je de lijn zonder te tellen. */}
              {now && nowShown ? (
                <span
                  aria-hidden
                  className="tg-now-pill"
                  style={{ top: ((nowMinutes - firstHour * 60) / 60) * hourPx }}
                >
                  {formatTime(now)}
                </span>
              ) : null}
              {/* Elk uur hangt gecentreerd op zijn lijn, behalve het eerste: dat
                  staat op de bovenrand, en half omhoog zou het onder de dagkop
                  verdwijnen. Het stond er daarom eerst rechtop onder, maar dan
                  plakte het tegen het tweede uur, dat op zijn lijn
                  gecentreerd hangt. Het valt nu weg, zoals in elke agenda-app:
                  het uur eronder zegt al waar je bent. */}
              {hours.slice(1).map((hour, index) => (
                <span
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-vtk-muted"
                  style={{ top: (index + 1) * hourPx }}
                >
                  {String(hour % 24).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>

          {parsedDays.map((day, dayIndex) => {
            const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
            const isWeekend = WEEKEND.has(weekdayKeyFormatter.format(day));
            /** De aangeklikte rit op deze dag: de sporen die ze niet dekken, gaan lichter. */
            const selectedPiece = selectedId
              ? gridPerDay[dayIndex].find((block) => block.id === selectedId)
              : undefined;
            // Enkel een dag met sporen schuift haar ritten op; op een dag waarop
            // niemand iets opgaf, houden de ritten de hele breedte.
            const dayInset =
              tracks && bandsPerDay[dayIndex].some((band) => band.to > firstHour * 60)
                ? trackShape.inset
                : '0px';
            return (
              <div
                key={days[dayIndex]}
                ref={(node) => {
                  columns_.current[dayIndex] = node;
                }}
                onPointerDown={(event) => beginCreate(event, dayIndex)}
                className={`tg-day relative border-l border-vtk-navy/[0.07] ${
                  isToday ? 'bg-vtk-yellow/[0.07]' : isWeekend ? 'bg-vtk-paper/45' : ''
                } ${onCreateRange ? 'cursor-copy' : ''}`}
                style={{ height }}
              >
                {/* Uurlijnen, zodat je een blok op de klok kan leggen.
                    `pointer-events-none` is hier niet cosmetisch: zonder dat is
                    zo'n lijn het doelwit van een pointerdown die er toevallig op
                    valt, en `beginCreate` slikt die (hij eist de kolom zelf als
                    doelwit). Dat gaf één dode lijn per uur, midden in het vlak
                    waarin je een rit moet kunnen tekenen. */}
                {hours.map((hour, index) => (
                  <span
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 border-t border-vtk-navy/[0.07]"
                    style={{ top: index * hourPx }}
                    aria-hidden
                  />
                ))}

                {/* De sporen van de beschikbaarheid (knop Beschikbaarheid in de
                    planning): één per chauffeur, links in de kolom, in zijn
                    kleur. Vol is beschikbaar, de arcering zegt "liever niet" of
                    "enkel in nood", zoals overal. Een sleep die op een spoor
                    begint, tekent gewoon een rit: het spoor geeft hem door aan
                    de kolom en houdt enkel de tooltip met de naam. */}
                {tracks
                  ? bandsPerDay[dayIndex]
                      .filter((band) => band.to > firstHour * 60)
                      .map((band) => {
                        const track = trackOrder.findIndex((driver) => driver.id === band.driverId);
                        const from = Math.max(band.from, firstHour * 60);
                        const dim =
                          selectedPiece !== undefined &&
                          !(band.from <= selectedPiece.from && band.to >= selectedPiece.to);
                        return (
                          <span
                            key={`${band.id}-${days[dayIndex]}`}
                            title={`${band.driverName}: ${AVAILABILITY_KIND_LABEL[band.kind].toLowerCase()}, ${clockLabel(band.from)} tot ${clockLabel(band.to)}${band.note ? ` (${band.note})` : ''}`}
                            onPointerDown={(event) => beginCreate(event, dayIndex)}
                            className={`tg-track ${availabilityFillClass(band.kind)}`}
                            style={{
                              top: ((from - firstHour * 60) / 60) * hourPx,
                              height: Math.max(4, ((band.to - from) / 60) * hourPx),
                              left: `calc(4px + ${trackShape.step} * ${track})`,
                              width: `calc(${trackShape.step} - 2px)`,
                              backgroundColor: driverToneVar(band.driverId, driverColors),
                              opacity: dim ? 0.28 : undefined,
                            }}
                          />
                        );
                      })
                  : null}
                {tracks && selectedPiece ? (
                  // Waar de aangeklikte rit valt, over de sporen heen: wie daar
                  // een spoor heeft dat de hele kader vult, kan haar rijden.
                  <span
                    aria-hidden
                    className="pointer-events-none absolute z-[2] rounded-[7px] border-[1.5px] border-vtk-navy"
                    style={{
                      left: 1,
                      width: `calc(${trackShape.area} + 6px)`,
                      top: ((selectedPiece.from - firstHour * 60) / 60) * hourPx - 2,
                      height: ((selectedPiece.to - selectedPiece.from) / 60) * hourPx + 4,
                    }}
                  />
                ) : null}

                {/* De beschikbaarheid van de chauffeurs (V1), helemaal onderaan
                    de stapel: het is context waarbinnen je plant, geen afspraak
                    die met een rit kan concurreren om je aandacht. */}
                {(tracks ? [] : bandsPerDay[dayIndex])
                  .filter((band) => band.to > firstHour * 60)
                  .map((band) => {
                  const bandFrom = Math.max(band.from, firstHour * 60);
                  const height = Math.max(4, ((band.to - bandFrom) / 60) * hourPx);
                  return (
                    <span
                      key={`${band.id}-${days[dayIndex]}`}
                      aria-hidden
                      title={`${band.driverName}: ${AVAILABILITY_KIND_LABEL[band.kind].toLowerCase()}${band.note ? ` (${band.note})` : ''}`}
                      // Een eigen band vangt de muis, anders verschijnen haar
                      // grepen niet bij het overgaan. Haar midden geeft de
                      // sleep door aan de kolom: daar teken en wis je zoals
                      // altijd. Een klik zonder sleep opent haar menuutje.
                      onPointerDown={
                        onResizeBand ? (event) => beginCreate(event, dayIndex, band.id) : undefined
                      }
                      // Het patroon zegt hoe graag, de kleur zegt wie. Zie
                      // lib/availability-kinds.ts.
                      className={`absolute inset-x-0 overflow-hidden rounded-[6px] ${
                        onResizeBand ? `group ${onSelectBand ? 'cursor-pointer' : ''}` : 'pointer-events-none'
                      } ${availabilityFillClass(band.kind)} ${
                        bandsProminent
                          ? 'border border-vtk-navy/30 px-1.5 py-0.5 text-[11px] font-semibold text-vtk-ink shadow-sm'
                          : 'opacity-30'
                      }`}
                      style={{
                        top: ((bandFrom - firstHour * 60) / 60) * hourPx,
                        height,
                        backgroundColor: driverColorVar(band.driverId, driverColors),
                        opacity: draggedOpacity(band.id, dayIndex),
                      }}
                    >
                      {/* Het uur in de band zelf, zodra ze hoog genoeg is: op je
                          eigen scherm wil je zien wát je aangeduid hebt, niet
                          enkel dát er iets staat. Is ze hoog genoeg voor twee
                          regels, dan staat de soort erbij; het patroon alleen
                          leer je pas na een keer of drie herkennen. */}
                      {bandsProminent && height >= 26 ? (
                        <>
                          {`${clockLabel(band.from)} - ${clockLabel(band.to)}`}
                          {height >= 44 && band.kind !== 'JA' ? (
                            <span className="block text-[10px] font-medium">
                              {AVAILABILITY_KIND_LABEL[band.kind]}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                      {onResizeBand && !band.continuesBefore && height >= TOP_GRIP_MIN_PX ? (
                        <ResizeGrip
                          edge="start"
                          onPointerDown={(event) =>
                            beginResize(event, 'band', band, dayIndex, 'start')
                          }
                        />
                      ) : null}
                      {onResizeBand && !band.continuesAfter ? (
                        <ResizeGrip
                          edge="end"
                          onPointerDown={(event) => beginResize(event, 'band', band, dayIndex, 'end')}
                        />
                      ) : null}
                    </span>
                  );
                })}

                {/* Waar we nu staan. Enkel op vandaag, en enkel wanneer dat uur
                    ook getekend wordt: buiten het venster zou de lijn tegen de
                    boven- of onderrand plakken en een uur beweren dat er niet is. */}
                {isToday && nowMinutes >= firstHour * 60 && nowMinutes <= lastHour * 60 ? (
                  <span
                    aria-hidden
                    // Ook hier `pointer-events-none`, om dezelfde reden als bij
                    // de uurlijnen: de nu-lijn ligt op het uur waarop je het
                    // vaakst iets inplant.
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-vtk-danger"
                    style={{ top: ((nowMinutes - firstHour * 60) / 60) * hourPx }}
                  />
                ) : null}

                {/* Het blok dat je nu tekent of versleept, als schaduw op zijn
                    nieuwe plek. Zonder dit zie je pas na het loslaten waar de rit
                    terechtkomt, en dan is het al gebeurd. */}
                {drag && drag.dayIndex === dayIndex && moved.current ? (
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute z-20 overflow-hidden rounded-[8px] border-2 border-dashed px-1.5 py-1 text-[11px] font-semibold tabular-nums ${
                      clash
                        ? 'border-vtk-danger bg-vtk-danger-soft text-vtk-danger'
                        : 'border-vtk-navy bg-vtk-navy/10 text-vtk-navy'
                    }`}
                    style={{
                      top: ((Math.min(drag.from, drag.to) - firstHour * 60) / 60) * hourPx,
                      height: Math.max(
                        18,
                        (Math.abs(drag.to - drag.from) / 60) * hourPx - 2
                      ),
                      // Bij het rekken van een rit op de plek van het blok zelf,
                      // dat intussen verborgen staat; anders over de hele kolom,
                      // zoals een band ook loopt.
                      ...(drag.kind === 'resize' && drag.target === 'block'
                        ? laneBox(drag.lane, drag.lanes, dayInset)
                        : { left: `calc(${dayInset})`, right: 0 }),
                    }}
                  >
                    {formatTime(dragRange(drag, day).start)}
                    {'-'}
                    {formatTime(dragRange(drag, day).end)}
                    {clash ? (
                      <span className="block truncate font-medium">{t.clashesWith(clash.title)}</span>
                    ) : null}
                  </div>
                ) : null}

                {/* De rit in wording. Onder de echte blokken (`z-10` tegen
                    hun eigen stapel) zodat ze niets afdekt, maar boven de
                    uurlijnen zodat ze als blok leest en niet als arcering. */}
                {draftPerDay[dayIndex] && draftPerDay[dayIndex]!.to > firstHour * 60 ? (
                  <div
                    aria-hidden
                    className="trip-draft pointer-events-none absolute right-0 z-10 rounded-[8px] px-1.5 py-1 text-[11px] font-semibold tabular-nums"
                    style={{
                      left: `calc(${dayInset})`,
                      top:
                        ((Math.max(draftPerDay[dayIndex]!.from, firstHour * 60) - firstHour * 60) /
                          60) *
                        hourPx,
                      height: Math.max(
                        18,
                        ((draftPerDay[dayIndex]!.to -
                          Math.max(draftPerDay[dayIndex]!.from, firstHour * 60)) /
                          60) *
                          hourPx -
                          2
                      ),
                    }}
                  >
                    {formatTime(momentOn(day, draftPerDay[dayIndex]!.from))}
                    {'-'}
                    {formatTime(momentOn(day, draftPerDay[dayIndex]!.to))}
                  </div>
                ) : null}

                {gridPerDay[dayIndex].map((block) => (
                  <TimeBlock
                    key={`${block.id}-${days[dayIndex]}`}
                    block={block}
                    vehicle={vehicleById.get(block.vehicleId) ?? null}
                    inset={dayInset}
                    firstHour={firstHour}
                    hourPx={hourPx}
                    gridHeight={height}
                    onSelect={onSelect}
                    selected={selectedId === block.id}
                    showDriver={showDriver}
                    fields={fields}
                    driverColors={driverColors}
                    draggable={Boolean(onMoveBlock)}
                    dragOpacity={draggedOpacity(block.id, dayIndex)}
                    onMoveStart={(event) => beginMove(event, block, dayIndex)}
                    onResizeStart={(event, edge) =>
                      beginResize(event, 'block', block, dayIndex, edge)
                    }
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

/**
 * Een rit in de ingeklapte nacht: één regel in de strook boven het rooster,
 * met dezelfde look als een blok (vulkleur, arcering, rand). Aanklikken opent de
 * rit zoals een blok dat doet; `data-trip` zodat het kaartje er naast kan staan.
 */
function NightPill({
  block,
  vehicle,
  onSelect,
  selected,
  showDriver,
  driverColors,
}: {
  block: Placed<TripBlock>;
  vehicle: CalendarVehicle | null;
  onSelect?: (blockId: string) => void;
  selected: boolean;
  showDriver: boolean;
  driverColors?: DriverColorOverrides;
}) {
  const t = useCalendarCopy();
  const look = blockLook({ block, vehicle, showDriver, driverColors, selected });
  const label = blockLabel({
    block,
    vehicle,
    showDriver,
    awaitsDriver: look.awaitsDriver,
    start: block.start,
    end: block.end,
    t,
  });
  const text = (
    <>
      <span className="shrink-0 font-semibold tabular-nums">
        {block.continuesBefore ? '↑ ' : ''}
        {formatTime(block.start)}-{formatTime(block.end)}
      </span>
      <span className="min-w-0 truncate">{block.title}</span>
    </>
  );
  if (!onSelect) {
    return (
      <span className={`tg-night-pill ${look.className}`} style={look.style} title={label}>
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-trip={block.id}
      onClick={() => onSelect(block.id)}
      title={label}
      aria-label={label}
      className={`tg-night-pill transition-shadow hover:shadow-md ${look.className}`}
      style={look.style}
    >
      {text}
    </button>
  );
}

function TimeBlock({
  block,
  vehicle,
  inset,
  firstHour,
  hourPx,
  gridHeight,
  onSelect,
  selected,
  showDriver,
  fields,
  driverColors,
  draggable,
  dragOpacity,
  onMoveStart,
  onResizeStart,
  justDragged,
}: {
  block: Placed<TripBlock>;
  vehicle: CalendarVehicle | null;
  /** Wat de sporen van de beschikbaarheid links innemen; zie `trackGeometry`. */
  inset: string;
  firstHour: number;
  hourPx: number;
  /** De hoogte van de dagkolom: een kort blok om 23:45 schuift erbinnen. */
  gridHeight: number;
  onSelect?: (blockId: string) => void;
  selected: boolean;
  showDriver: boolean;
  fields: TripFields;
  driverColors?: DriverColorOverrides;
  draggable?: boolean;
  /** Dit blok wordt op dit moment versleept; de schaduw toont waar het heen gaat. */
  dragOpacity?: number;
  onMoveStart?: (event: React.PointerEvent) => void;
  onResizeStart?: (event: React.PointerEvent, edge: 'start' | 'end') => void;
  /** Is er net gesleept? Dan is deze klik het loslaten en geen selectie. */
  justDragged?: () => boolean;
}) {
  const t = useCalendarCopy();
  const top = ((block.from - firstHour * 60) / 60) * hourPx;
  const rawHeight = ((block.to - block.from) / 60) * hourPx;
  const look = blockLook({ block, vehicle, showDriver, driverColors, selected });
  // Minimaal 24px: een kwartierrit moet aanklikbaar blijven, ook uitgezoomd.
  const height = Math.max(24, rawHeight - 2);
  /**
   * Hoeveel regels er volledig in passen: 11px tekst met `leading-tight` is
   * 13,75px per regel, de bovenste regel draagt het bolletje met de initialen en
   * is 16px, en daarboven en -onder zit padding en een rand (een dikkere voor
   * "te beslissen", "geen chauffeur" en een botsing).
   */
  const chrome =
    11 +
    (block.status === 'REQUESTED' ? 2 : 0) +
    (look.awaitsDriver || block.conflict ? 2 : 0);
  const maxLines = Math.max(1, 1 + Math.floor((height - chrome - 16) / 13.75));

  const style: React.CSSProperties = {
    ...look.style,
    // Binnen de kolom: een rit van een kwartier om 23:45 is 24px hoog en liep
    // anders onder de dag uit, waardoor "hele dag" toch een scrollbalk kreeg.
    top: Math.max(0, Math.min(top, gridHeight - height)),
    height,
    // Met de strook rechts van de kolom vrij: zie `BLOCK_GUTTER_PX`. Zonder die
    // strook is er op het uur van een rit geen lege plek meer om een tweede rit
    // op te tekenen.
    ...laneBox(block.lane, block.lanes, inset),
    opacity: dragOpacity ?? look.style.opacity,
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
    t,
  });
  const content: ReactNode = (
    <BlockContent
      block={block}
      vehicle={vehicle}
      showDriver={showDriver}
      fields={fields}
      awaitsDriver={look.awaitsDriver}
      start={block.start}
      end={block.end}
      continuesBefore={block.continuesBefore}
      continuesAfter={block.continuesAfter}
      compact={block.lanes > 1}
      driverColors={driverColors}
      maxLines={maxLines}
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
  // die over middernacht loopt zie je hier maar de helft. Rekken mag wel, aan de
  // rand die op deze dag ligt.
  const movable = draggable && !block.continuesBefore && !block.continuesAfter;
  const startGrip = draggable && !block.continuesBefore && height >= TOP_GRIP_MIN_PX;
  const endGrip = draggable && !block.continuesAfter;

  return (
    <button
      type="button"
      // Waar het detailpaneel zich aan vastknoopt; zie `TripInspector`.
      data-trip={block.id}
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
      onPointerDown={movable ? onMoveStart : undefined}
      // Hover tilt het blok met een schaduw, en niets anders. Het was
      // `hover:brightness-95` met `transition`: een filter die animeert, zet het
      // blok op een eigen laag en tekent de tekst opnieuw, en dan verspringt de
      // tekst onder je muis telkens je over de week beweegt.
      className={`group absolute transition-shadow hover:z-[15] hover:shadow-md ${movable ? 'cursor-grab' : ''} ${look.className}`}
      style={style}
      title={label}
      aria-label={label}
    >
      {content}
      {startGrip ? (
        <ResizeGrip edge="start" onPointerDown={(event) => onResizeStart?.(event, 'start')} />
      ) : null}
      {endGrip ? (
        <ResizeGrip edge="end" onPointerDown={(event) => onResizeStart?.(event, 'end')} />
      ) : null}
    </button>
  );
}

/**
 * De greep aan de boven- of onderrand: het begin- of einduur verslepen.
 *
 * Een eigen strookje en niet de rand van het blok zelf: die randen liggen bij
 * overlap tegen elkaar, en dan pak je de verkeerde rit vast.
 *
 * Het streepje erin verschijnt pas wanneer je over het blok gaat. Zonder
 * streepje wist niemand dat de onderrand te grijpen viel (de greep bestond al,
 * enkel de cursor verried haar); altijd zichtbaar zou elk blok van een kwartier
 * met twee strepen beladen. `bg-current` zodat het de tekstkleur van het blok
 * volgt, ook het rood van een botsing.
 */
function ResizeGrip({
  edge,
  onPointerDown,
}: {
  edge: 'start' | 'end';
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  return (
    <span
      aria-hidden
      onPointerDown={onPointerDown}
      className={`absolute inset-x-0 z-10 cursor-ns-resize ${edge === 'start' ? 'top-0' : 'bottom-0'}`}
      style={{ height: RESIZE_GRIP_PX }}
    >
      {/* Tegen de rand en niet in het midden van de strook: daar stond het
          over het beginuur, dat op dezelfde hoogte begint. */}
      <span
        className={`pointer-events-none absolute left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-50 ${
          edge === 'start' ? 'top-[2px]' : 'bottom-[2px]'
        }`}
      />
    </span>
  );
}
