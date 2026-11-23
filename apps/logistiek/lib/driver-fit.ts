/**
 * Wie kan deze rit rijden? De chauffeurs op volgorde van hoe goed hun opgegeven
 * beschikbaarheid bij een rit past.
 *
 * Puur en zonder React of Prisma, zodat de planning, de keuzelijsten en de test
 * hetzelfde antwoord geven. Alle momenten zijn milliseconden; de vensters komen
 * zoals de kalender ze krijgt (`AvailabilityBand`).
 *
 * De volgorde, van best naar slechtst:
 *
 * - **kan**: zijn vensters dekken de hele rit, allemaal "beschikbaar".
 * - **liever-niet** / **nood**: gedekt, maar (ergens) met die soort. Het
 *   zwakste stuk telt: "beschikbaar tot 18:00 en daarna liever niet" is liever
 *   niet, want vanaf 18:00 vraag je het hem eigenlijk liever niet.
 * - **deels**: een venster raakt de rit, maar dekt ze niet helemaal.
 * - **onbekend**: er zijn voor deze periode geen uren van hem gekend (hij gaf
 *   niets door, of hij is geen karchauffeur en kan dat niet). Dat is iets anders dan
 *   niet kunnen (zie "Wie kan er rijden" in docs/design-decisions.md), en het
 *   staat daarom vóór "niet".
 * - **niet**: hij gaf uren door, maar niet voor dit moment.
 * - **bezet**: hij rijdt op dat moment al een andere rit.
 *
 * Aaneensluitende vensters tellen samen: wie 16:00-18:00 en 18:00-22:00 opgaf,
 * kan een rit van 17:00 tot 20:00 rijden.
 */

import type { AvailabilityKind } from './availability-day';

export const FIT_LEVELS = ['kan', 'liever-niet', 'nood', 'deels', 'onbekend', 'niet', 'bezet'] as const;
export type FitLevel = (typeof FIT_LEVELS)[number];

export type FitWindow = { driverId: string; start: number; end: number; kind: AvailabilityKind };
export type FitTrip = { id: string; driverId: string | null; start: number; end: number; title: string };

export type DriverFit = {
  driverId: string;
  level: FitLevel;
  /**
   * De uren die het antwoord dragen: bij "kan", "liever niet" en "nood" de
   * vensters die de rit dekken, samengenomen; bij "deels" het venster met de
   * grootste overlap. `null` wanneer er niets overlapt.
   */
  window: { start: number; end: number; kind: AvailabilityKind } | null;
  /** De rit die deze chauffeur op dat moment al rijdt. */
  busyWith: { id: string; title: string; start: number; end: number } | null;
};

const KIND_RANK: Record<AvailabilityKind, number> = { JA: 0, LIEVER_NIET: 1, NOOD: 2 };
const RANK_KIND: AvailabilityKind[] = ['JA', 'LIEVER_NIET', 'NOOD'];

/** Hoe één chauffeur bij één rit past. */
export function fitForTrip(
  trip: { id: string; start: number; end: number },
  driverId: string,
  windows: readonly FitWindow[],
  trips: readonly FitTrip[]
): DriverFit {
  const mine = windows.filter((window) => window.driverId === driverId);
  const overlapping = mine.filter((window) => window.start < trip.end && window.end > trip.start);
  const busy = trips.find(
    (other) =>
      other.id !== trip.id && other.driverId === driverId && other.start < trip.end && other.end > trip.start
  );

  // Het stuk van de rit in stukjes knippen op elke vensterrand die erbinnen
  // valt; per stukje telt het beste venster dat het dekt.
  const points = [
    trip.start,
    trip.end,
    ...overlapping.flatMap((window) => [window.start, window.end]).filter((at) => at > trip.start && at < trip.end),
  ]
    .filter((at, index, all) => all.indexOf(at) === index)
    .sort((a, b) => a - b);

  let covered = overlapping.length > 0;
  let worst = 0;
  for (let index = 0; covered && index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const ranks = overlapping
      .filter((window) => window.start <= from && window.end >= to)
      .map((window) => KIND_RANK[window.kind]);
    if (ranks.length === 0) covered = false;
    else worst = Math.max(worst, Math.min(...ranks));
  }

  let level: FitLevel;
  let window: DriverFit['window'] = null;
  if (covered) {
    level = worst === 0 ? 'kan' : worst === 1 ? 'liever-niet' : 'nood';
    window = {
      start: Math.min(...overlapping.map((entry) => entry.start)),
      end: Math.max(...overlapping.map((entry) => entry.end)),
      kind: RANK_KIND[worst],
    };
  } else if (overlapping.length > 0) {
    level = 'deels';
    const overlap = (entry: FitWindow) => Math.min(entry.end, trip.end) - Math.max(entry.start, trip.start);
    const best = overlapping.reduce((a, b) => (overlap(b) > overlap(a) ? b : a));
    window = { start: best.start, end: best.end, kind: best.kind };
  } else {
    level = mine.length === 0 ? 'onbekend' : 'niet';
  }

  if (busy) level = 'bezet';

  return {
    driverId,
    level,
    window,
    busyWith: busy ? { id: busy.id, title: busy.title, start: busy.start, end: busy.end } : null,
  };
}

/**
 * Alle chauffeurs op volgorde voor deze rit. Bij een gelijke stand blijft de
 * volgorde van `driverIds` staan (die is al op naam), zodat de lijst niet
 * herschikt wanneer je er een kiest.
 */
export function rankDriversForTrip(
  trip: { id: string; start: number; end: number },
  driverIds: readonly string[],
  windows: readonly FitWindow[],
  trips: readonly FitTrip[]
): DriverFit[] {
  return driverIds
    .map((driverId, index) => ({ fit: fitForTrip(trip, driverId, windows, trips), index }))
    .sort((a, b) => FIT_LEVELS.indexOf(a.fit.level) - FIT_LEVELS.indexOf(b.fit.level) || a.index - b.index)
    .map(({ fit }) => fit);
}

/**
 * Kort, voor achter een naam in een keuzelijst ("Arne (kan)"). Leeg wanneer er
 * niets te zeggen valt: "onbekend" achter elke naam die nooit iets invult, maakt
 * de lijst enkel langer.
 */
export const FIT_SHORT: Record<FitLevel, string> = {
  kan: 'kan',
  'liever-niet': 'liever niet',
  nood: 'enkel in nood',
  deels: 'deels',
  onbekend: '',
  niet: 'niet op dit uur',
  bezet: 'rijdt dan al',
};
