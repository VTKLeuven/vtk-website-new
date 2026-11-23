/**
 * Hoe iemand de transportplanning bekijkt: zoom, wat er in een blok staat, de
 * nacht open of dicht, de beschikbaarheid aan of uit, en of dit een smal scherm
 * is. Eén cookie die de server leest.
 *
 * Een cookie en geen `localStorage`, en dat is de hele reden van dit bestand.
 * Uit `localStorage` kon pas gelezen worden na de eerste render: de kalender
 * verscheen op "hele dag" met de standaardregels, en sprong daarna naar de
 * bewaarde zoom en velden. Op een telefoon wisselde de week daarna nog eens naar
 * een dag. Met een cookie rendert de server meteen wat je de vorige keer zag.
 *
 * Bewust zonder `'use client'`: de pagina (een servercomponent) leest de cookie
 * met dezelfde `parsePlannerPrefs`, en een export uit een client-module komt
 * daar als referentie binnen en niet als functie.
 *
 * Wat er níét in staat: de filters. Die horen in de URL, want een gefilterde
 * week hoort deelbaar te zijn (zie `lib/transport-filters.ts`). Dit zijn
 * voorkeuren van één persoon.
 */

import {
  DEFAULT_TRIP_FIELDS,
  TRIP_BLOCK_FIELDS,
  TRIP_FIELDS_STORAGE_KEY,
  ZOOM_MIN,
  ZOOM_STORAGE_KEY,
  clampZoom,
  parseTripFields,
  type TripFields,
} from './types';

/** Een eigen naam: lokaal delen vtk.be en de uitleendienst `localhost`, en cookies kennen geen poort. */
export const PLANNER_PREFS_COOKIE = 'logistiek-planning';

/** Een jaar: een voorkeur die na een maand vergeten is, is geen voorkeur. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type PlannerPrefs = {
  zoom: number;
  fields: TripFields;
  /** De nacht (00:00 tot 06:00) uitgeklapt in het rooster in plaats van als strook. */
  nightOpen: boolean;
  /** De sporen van de beschikbaarheid in de planning van het team. */
  availability: boolean;
  /**
   * Was het scherm de vorige keer smal (een telefoon)? `null` zolang dat nooit
   * gemeten is. Daarmee opent de planning op een telefoon meteen op één dag, in
   * plaats van eerst de week te tonen en dan te wisselen.
   */
  narrow: boolean | null;
};

export const DEFAULT_PLANNER_PREFS: PlannerPrefs = {
  zoom: ZOOM_MIN,
  fields: DEFAULT_TRIP_FIELDS,
  nightOpen: false,
  availability: false,
  narrow: null,
};

/**
 * De cookie lezen. `null` wanneer er geen is: dan weet de browser misschien nog
 * iets uit de tijd van `localStorage` (zie {@link legacyPlannerPrefs}).
 *
 * Wat niet klopt, valt per onderdeel terug op de standaard. Een veld dat later
 * bijkomt in `TRIP_BLOCK_FIELDS`, staat achteraan in de reeks en krijgt zo zijn
 * standaard in plaats van "uit".
 */
export function parsePlannerPrefs(raw: string | null | undefined): PlannerPrefs | null {
  if (!raw) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(decodeURIComponent(raw));
  } catch {
    return null;
  }
  const zoom = Number(params.get('z'));
  const bits = params.get('v') ?? '';
  const fields = Object.fromEntries(
    TRIP_BLOCK_FIELDS.map(({ key }, index) => [
      key,
      bits[index] === '1' ? true : bits[index] === '0' ? false : DEFAULT_TRIP_FIELDS[key],
    ])
  ) as TripFields;
  const narrow = params.get('s');
  return {
    zoom: params.has('z') && Number.isFinite(zoom) ? clampZoom(zoom) : ZOOM_MIN,
    fields,
    nightOpen: params.get('n') === '1',
    availability: params.get('b') === '1',
    narrow: narrow === '1' ? true : narrow === '0' ? false : null,
  };
}

export function serializePlannerPrefs(prefs: PlannerPrefs): string {
  const params = new URLSearchParams();
  params.set('z', String(Math.round(prefs.zoom * 1000) / 1000));
  params.set('v', TRIP_BLOCK_FIELDS.map(({ key }) => (prefs.fields[key] ? '1' : '0')).join(''));
  params.set('n', prefs.nightOpen ? '1' : '0');
  params.set('b', prefs.availability ? '1' : '0');
  if (prefs.narrow !== null) params.set('s', prefs.narrow ? '1' : '0');
  return params.toString();
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return null;
}

/**
 * In de browser één voorkeur aanpassen en de rest laten staan.
 *
 * Lezen, samenvoegen en schrijven, en niet het hele object uit de component: de
 * zoom staat in de kalender, de beschikbaarheid in de planning, en die twee
 * mogen elkaar niet overschrijven met een oude waarde.
 */
export function updatePlannerPrefs(patch: Partial<PlannerPrefs>): void {
  if (typeof document === 'undefined') return;
  const current = parsePlannerPrefs(readCookie(PLANNER_PREFS_COOKIE)) ?? DEFAULT_PLANNER_PREFS;
  const next: PlannerPrefs = { ...current, ...patch };
  document.cookie = `${PLANNER_PREFS_COOKIE}=${encodeURIComponent(
    serializePlannerPrefs(next)
  )}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * Wat deze browser nog in `localStorage` had van voor de cookie, of `null`.
 *
 * Eén keer gelezen, wanneer er nog geen cookie is; daarna staat het in de cookie
 * en leest de server het. Zo verliest wie zijn zoom en velden ooit instelde die
 * niet bij de overstap. In een try/catch: in een privévenster gooit de accessor.
 */
export function legacyPlannerPrefs(): Pick<PlannerPrefs, 'zoom' | 'fields'> | null {
  try {
    const zoom = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    const fields = window.localStorage.getItem(TRIP_FIELDS_STORAGE_KEY);
    if (zoom === null && fields === null) return null;
    return {
      zoom: zoom === null ? ZOOM_MIN : clampZoom(Number(zoom)),
      fields: parseTripFields(fields),
    };
  } catch {
    return null;
  }
}
