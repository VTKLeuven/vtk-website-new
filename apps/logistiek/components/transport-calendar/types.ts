/**
 * Wat de transportplanning tekent.
 *
 * Bewust een eigen module zonder `'use client'`: in een client-module wordt élke
 * export een client-referentie, ook een gewone array of een constante. De
 * server-component kreeg dan geen lijst maar een proxy. Zie de gelijkaardige
 * comment in `app/beheer/kalender/kalender-kinds.ts`; het heeft daar ooit een
 * pagina omgegooid met "CALENDAR_KINDS is not iterable".
 */

/** Eén rit als blok op de kalender. */
export type TripBlock = {
  id: string;
  vehicleId: string;
  /** ISO-strings: dit reist naar een client-component, en `Date` niet. */
  startAt: string;
  endAt: string;
  status: string;
  /** Bovenste regel in het blok: het evenement of het doel van de rit. */
  title: string;
  /** Tweede regel: de aanvrager, of niets op het publieke overzicht. */
  subtitle: string | null;
  driver: { id: string; name: string } | null;
  /** Rood: twee goedgekeurde ritten met hetzelfde voertuig op hetzelfde moment. */
  conflict: boolean;
};

export type CalendarVehicle = {
  id: string;
  name: string;
  /** `kar`, `auto`, `bakfiets`, ...: bepaalt welk icoon in het blok staat. */
  code: string;
  /** Arcering van dit voertuig (K1); null of `none` = geen. */
  pattern?: string | null;
  /**
   * Rijdt Logistiek dit voertuig? De bakfiets neemt de aanvrager zelf mee, dus
   * daar is "nog geen chauffeur" geen openstaande taak maar de normale gang van
   * zaken (T13). Weggelaten = wel, zoals het veld in de databank.
   */
  needsDriver?: boolean;
};

/**
 * De zoom van de kalender, als **factor op "de hele dag past in beeld"**.
 *
 * Niet in pixels per uur, en dat is het verschil met de eerste versie. Een vaste
 * pixelmaat weet niet hoe groot het scherm is: dezelfde 42px per uur vulde een
 * laptop half en een volledig scherm voor een derde, en "inzoomen" betekende dan
 * iets anders naargelang waar je zat.
 *
 * Zo werkt het nu, zoals een agenda-app het doet:
 *
 * - **Zoom 1 = de hele dag past exact in het venster.** Geen verticale
 *   scrollbalk, van 00:00 tot 24:00 in beeld. In volledig scherm is dat venster
 *   groter, dus wordt een uur vanzelf hoger; de kalender vúlt het scherm in
 *   plaats van er klein in te blijven staan.
 * - **Boven 1 wordt een uur hoger en scrolt de dag.** Dat is wat je wil zodra
 *   er iets te lezen valt in een blok van een kwartier.
 * - **Onder 1 bestaat niet.** Bij 1 zie je de dag al helemaal; verder uitzoomen
 *   voegt enkel wit toe.
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
 * Ondergrens in pixels per uur. Op een korte pagina zou "de hele dag past" op
 * 14px per uur uitkomen, en dan is een uurlijn niet meer van de volgende te
 * onderscheiden. Onder deze grens scrolt de kalender dus toch, ook op zoom 1.
 */
export const MIN_HOUR_PX = 22;
/** Bovengrens, zodat een misgelopen berekening geen kalender van 40 schermen maakt. */
export const MAX_HOUR_PX = 320;

/** Uren op een dag. De kalender toont ze allemaal en scrolt naar het interessante deel. */
export const DAY_HOURS = 24;

/**
 * De uurhoogte die bij deze pane-hoogte en deze zoom hoort.
 *
 * Eén functie voor beide kanten: het rooster tekent ermee, en de werkbalk rekent
 * er de scrollpositie mee om bij het zoomen. Twee keer dezelfde klemming
 * schrijven betekent dat het anker na de eerste wijziging een halve schermhoogte
 * verkeerd zit.
 */
export function hourPxFor(fitHourPx: number, zoom: number): number {
  return Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, fitHourPx * zoom));
}

export const ZOOM_STORAGE_KEY = 'logistiek.transportplanning.zoom';

/**
 * Een venster waarin een chauffeur kan rijden (V1), als lichte band achter het
 * rooster.
 *
 * Achter en niet tussen de ritten: het is context en geen afspraak. Een band die
 * er even zwaar uitziet als een rit, laat je twee keer kijken om te zien wat er
 * effectief gepland is.
 */
export type AvailabilityBand = {
  id: string;
  driverId: string;
  driverName: string;
  /** ISO-strings, zoals alles wat naar een client-component reist. */
  startAt: string;
  endAt: string;
  note: string | null;
};
