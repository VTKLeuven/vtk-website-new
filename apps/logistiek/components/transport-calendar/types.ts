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
 * Hoe hoog één uur is, in pixels.
 *
 * `MIN` toont een hele dag zonder scrollen; `MAX` maakt een kwartierrit
 * aanklikbaar op een telefoon. De standaard is de hoogte waarmee de planning tot
 * nu toe getekend werd: genoeg voor de vier regels van een rit van een uur.
 */
export const HOUR_PX_DEFAULT = 42;
export const HOUR_PX_MIN = 24;
export const HOUR_PX_MAX = 108;
export const HOUR_PX_STEP = 12;

export function clampHourPx(value: number): number {
  if (!Number.isFinite(value)) return HOUR_PX_DEFAULT;
  return Math.min(HOUR_PX_MAX, Math.max(HOUR_PX_MIN, Math.round(value)));
}

/** Waar de zoom van deze persoon blijft staan. Per browser, zoals de catalogusweergave. */
export const ZOOM_STORAGE_KEY = 'logistiek.transportplanning.zoom';
