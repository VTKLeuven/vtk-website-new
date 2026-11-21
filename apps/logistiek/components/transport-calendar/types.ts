/**
 * Wat de transportplanning tekent.
 *
 * Bewust zonder `'use client'`: in een client-module wordt elke export een
 * client-referentie, ook een array, en dan krijgt een server-component een proxy
 * in plaats van een lijst ("... is not iterable", zie `kalender-kinds.ts`).
 */

import type { AvailabilityKind } from '@/lib/availability-day';

export type TripBlock = {
  id: string;
  vehicleId: string;
  /** ISO-strings: dit reist naar een client-component, en `Date` niet. */
  startAt: string;
  endAt: string;
  status: string;
  /**
   * Bovenste regel: waarvoor de rit dient (`tripTitle`), niet het evenement; vijf
   * blokken "Galabal" zeggen niet welke de tafels brengt. Zie design-decisions.
   */
  title: string;
  /** Het evenement, als regel die je in "Weergave" aanvinkt; enkel voor het team. */
  eventName?: string | null;
  /** Tweede regel: de aanvrager, of niets op het publieke overzicht. */
  subtitle: string | null;
  driver: { id: string; name: string } | null;
  /** Bestemming en lading: enkel voor het team, en standaard uitgevinkt ({@link TRIP_BLOCK_FIELDS}). */
  destination?: string | null;
  cargoNote?: string | null;
  /** Rood: twee goedgekeurde ritten met hetzelfde voertuig op hetzelfde moment. */
  conflict: boolean;
  /**
   * Van een post of werkgroep van de kijker: gele rail links (F4.15). Een vlag van
   * de server, want enkel die weet wie kijkt; op de planning van het team staat
   * ze nooit aan, daar zou ze niets onderscheiden.
   */
  mine?: boolean;
};

/**
 * Wat er in een rit-blok mag staan. Instelbaar omdat een rit van een kwartier
 * 24 px hoog is: wie chauffeurs indeelt, wil de naam, wie zijn post nakijkt de
 * post, en alles tegelijk past niet.
 *
 * Bewust niet hierdoor geregeld:
 * - de maandweergave: een balk van 14 px toont uur, voertuig en titel, meer past
 *   er niet, en een vinkje dat niets doet liegt;
 * - de tooltip en de screenreader: `blockLabel` zegt altijd alles;
 * - de chauffeur op het publieke overzicht: dat is `showDriver`, een beslissing
 *   van de server (daar staan geen namen) die de bezoeker niet kan terugzetten.
 */
export const TRIP_BLOCK_FIELDS = [
  { key: 'time', label: 'Uur' },
  { key: 'title', label: 'Waarvoor' },
  { key: 'event', label: 'Evenement' },
  { key: 'vehicle', label: 'Voertuig' },
  { key: 'driver', label: 'Chauffeur' },
  { key: 'requester', label: 'Post of werkgroep' },
  { key: 'destination', label: 'Bestemming' },
  { key: 'cargo', label: 'Lading' },
] as const;

export type TripBlockField = (typeof TRIP_BLOCK_FIELDS)[number]['key'];

export type TripFields = Record<TripBlockField, boolean>;

/**
 * De standaard: wie niets instelt, merkt niets. Post, bestemming, lading en
 * evenement staan uit omdat ze in een blok van een kwartier de vaste regels
 * wegduwen.
 */
export const DEFAULT_TRIP_FIELDS: TripFields = {
  time: true,
  title: true,
  event: false,
  vehicle: true,
  driver: true,
  requester: false,
  destination: false,
  cargo: false,
};

export const TRIP_FIELDS_STORAGE_KEY = 'logistiek.transportplanning.velden';

/**
 * De bewaarde keuze uit `localStorage`. Wat niet klopt, valt per veld terug op de
 * standaard, en een veld dat later bijkomt krijgt zo zijn standaard in plaats
 * van `false`.
 */
export function parseTripFields(raw: string | null): TripFields {
  if (!raw) return DEFAULT_TRIP_FIELDS;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_TRIP_FIELDS;
  }
  if (typeof stored !== 'object' || stored === null) return DEFAULT_TRIP_FIELDS;
  const values = stored as Record<string, unknown>;
  return Object.fromEntries(
    TRIP_BLOCK_FIELDS.map(({ key }) => [
      key,
      typeof values[key] === 'boolean' ? values[key] : DEFAULT_TRIP_FIELDS[key],
    ])
  ) as TripFields;
}

/** Hoeveel velden er afwijken van de standaard; voor de teller op de knop. */
export function countChangedFields(fields: TripFields): number {
  return TRIP_BLOCK_FIELDS.filter(({ key }) => fields[key] !== DEFAULT_TRIP_FIELDS[key]).length;
}

export type CalendarVehicle = {
  id: string;
  name: string;
  /** `kar`, `auto`, `bakfiets`, ...: bepaalt welk icoon in het blok staat. */
  code: string;
  /** Het ingestelde icoon (F4.21); leeg = afgeleid uit `code` (`vehicleIconName`). */
  icon?: string | null;
  /** Arcering van dit voertuig (K1); null of `none` = geen. */
  pattern?: string | null;
  /** Rijdt Logistiek dit voertuig? Bij de bakfiets niet, dus is "geen chauffeur" daar normaal (T13). */
  needsDriver?: boolean;
};

/**
 * De zoom als factor op "de hele dag past in beeld", niet in pixels per uur: een
 * vaste pixelmaat vult elk scherm anders. Zoom 1 toont 00:00 tot 24:00 zonder
 * scrollbalk, daarboven wordt een uur hoger en scrolt de dag, en onder 1 voegt
 * enkel wit toe en bestaat dus niet.
 */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
/** Eén klik op + of -. Vermenigvuldigen en niet optellen: dat voelt gelijkmatig. */
export const ZOOM_STEP = 1.25;

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/**
 * Ondergrens in pixels per uur; daaronder zijn de uurlijnen niet meer uit elkaar
 * te houden en scrolt de kalender toch, ook op zoom 1. 18 en niet 22 (F6.2): met
 * twee rijen evenementen op een laptop viel "hele dag" anders onderaan af.
 */
export const MIN_HOUR_PX = 18;
/** Bovengrens, zodat een misgelopen berekening geen kalender van 40 schermen maakt. */
export const MAX_HOUR_PX = 320;

/** Uren op een dag. De kalender toont ze allemaal en scrolt naar het interessante deel. */
export const DAY_HOURS = 24;

/**
 * De strook rechts in elke dagkolom die vrij blijft, zodat je naast een rit nog
 * een tweede kan tekenen: slepen start enkel op de kolom zelf
 * (`beginCreate`). Eén keer per kolom, na de laatste baan, en niet per blok;
 * tussen de banen zit enkel `LANE_GAP_PX`.
 */
export const BLOCK_GUTTER_PX = 14;

/** De naad tussen twee ritten naast elkaar, even smal als die tussen twee onder elkaar. */
export const LANE_GAP_PX = 2;

/** Plaats en breedte van een blok in een kolom met `lanes` banen, na aftrek van de strook rechts. */
export function laneBox(lane: number, lanes: number): { left: string; width: string } {
  const share = `(100% - ${BLOCK_GUTTER_PX}px) / ${lanes}`;
  const last = lane === lanes - 1;
  return {
    left: `calc(${share} * ${lane})`,
    width: last ? `calc(${share})` : `calc(${share} - ${LANE_GAP_PX}px)`,
  };
}

/**
 * De uurhoogte bij deze pane-hoogte en zoom. Het rooster en de werkbalk (het
 * scrollanker bij zoomen) gebruiken allebei deze ene klemming.
 */
export function hourPxFor(fitHourPx: number, zoom: number): number {
  return Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, fitHourPx * zoom));
}

/**
 * Zoom per pixel gescrolde afstand, niet per `wheel`-gebeurtenis: een trackpad
 * vuurt er dertig per gebaar, en een vaste factor per gebeurtenis sloeg meteen
 * tegen het maximum. 0,0015 was te traag; nu is een muisklik ongeveer een vijfde
 * erbij en een trackpadgebaar ongeveer een verdubbeling.
 */
export const ZOOM_WHEEL_PER_PX = 0.003;

/** Bovengrens per gebeurtenis: een muiswiel meldt soms 240 px per klik. */
export const ZOOM_WHEEL_MAX_PX = 60;

/** Eén regel en één pagina in pixels, om `deltaMode` 1 en 2 om te rekenen. */
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;

/** De scrollafstand in pixels; Firefox meldt soms regels (`deltaMode` 1) of pagina's (2). */
export function wheelPixels(event: { deltaY: number; deltaMode: number }): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_PX;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE_PX;
  return event.deltaY;
}

/** De nieuwe zoom na een wiel-gebeurtenis van `deltaPx` pixels. */
export function zoomByWheel(zoom: number, deltaPx: number): number {
  const capped = Math.max(-ZOOM_WHEEL_MAX_PX, Math.min(ZOOM_WHEEL_MAX_PX, deltaPx));
  // Omhoog scrollen (negatieve delta) zoomt in, zoals overal elders.
  return clampZoom(zoom * Math.exp(-capped * ZOOM_WHEEL_PER_PX));
}

export const ZOOM_STORAGE_KEY = 'logistiek.transportplanning.zoom';

/** Wanneer een chauffeur kan rijden: een lichte band achter de ritten, context en geen afspraak (V1). */
export type AvailabilityBand = {
  id: string;
  driverId: string;
  driverName: string;
  /** ISO-strings, zoals alles wat naar een client-component reist. */
  startAt: string;
  endAt: string;
  kind: AvailabilityKind;
  note: string | null;
};
