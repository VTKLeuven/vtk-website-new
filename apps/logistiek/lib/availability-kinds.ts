import type { AvailabilityKind } from './availability-day';

/**
 * Hoe de drie beschikbaarheden eruitzien en heten.
 *
 * Eén plek voor de woorden én voor het patroon, omdat ze op vier schermen
 * terugkomen (het raster op een telefoon, het tijdrooster op een computer, de
 * band achter de planning en de strook eronder). Liepen die uit elkaar, dan zou
 * "liever niet" op het ene scherm iets anders lijken dan op het andere.
 *
 * **Kleur én patroon, niet kleur alleen.** De vulkleur is de chauffeur (in de
 * planning) of geel (op je eigen raster); het verschil tussen de drie zit in het
 * patroon eroverheen. Drie tinten van dezelfde kleur zijn op een telefoon in de
 * zon of bij kleurenblindheid niet uit elkaar te houden, en de kleur is hier al
 * bezet om te zeggen wíé het is.
 *
 * `background-image` en niet `background`: de vulkleur staat als
 * `backgroundColor` in de stijl, en de shorthand zou die wegvegen. Dezelfde val
 * als bij de arcering van de voertuigen.
 */
export const AVAILABILITY_KIND_LABEL: Record<AvailabilityKind, string> = {
  JA: 'Beschikbaar',
  LIEVER_NIET: 'Liever niet',
  NOOD: 'In noodgeval',
};

/**
 * Korter, voor een rij pillen op een telefoon.
 *
 * "In noodgeval" duwde daar de vierde pil van het scherm, en een keuze die je
 * enkel vindt door opzij te vegen, bestaat niet.
 */
export const AVAILABILITY_KIND_SHORT: Record<AvailabilityKind, string> = {
  JA: 'Beschikbaar',
  LIEVER_NIET: 'Liever niet',
  NOOD: 'Noodgeval',
};

/** De zin eronder: wat het voor de planner betekent. */
export const AVAILABILITY_KIND_HINT: Record<AvailabilityKind, string> = {
  JA: 'Vraag me gerust.',
  LIEVER_NIET: 'Kan wel, maar vraag eerst iemand anders.',
  NOOD: 'Enkel als er echt niemand anders is.',
};

/** Het patroon over de vulkleur; `JA` is de volle kleur zelf. */
export function availabilityFillClass(kind: AvailabilityKind): string {
  if (kind === 'LIEVER_NIET') return 'avail-fill-liever-niet';
  if (kind === 'NOOD') return 'avail-fill-nood';
  return '';
}
