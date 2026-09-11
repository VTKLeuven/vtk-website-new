import type { UitleenRequesterType } from '@prisma/client';
import { compareText, type SortDir } from '@/app/beheer/sort';
import { requesterLabel } from './uitleen';

/**
 * Waarop de rittenlijst op /beheer/vervoer gesorteerd kan worden (R3).
 *
 * Apart van de pagina omdat dit het enige stuk is waar iets te rekenen valt (en
 * dus te testen); de pagina leest enkel de query en tekent de knoppen. Bewust
 * geen `'use client'`: de lijst is server-gerenderd, zodat een gesorteerde lijst
 * deelbaar blijft en de terugknop werkt.
 */

/**
 * De velden die de sortering nodig heeft. Een eigen vorm en niet
 * `AdminTransportBooking`: die sleept de betalingen, de historiek en de
 * bijrijders mee, en dan is deze module niet te testen zonder een halve databank
 * na te bouwen.
 */
export type SortableTrip = {
  startAt: Date;
  vehicle: { nameNl: string };
  driver: { name: string } | null;
  requesterType: UitleenRequesterType;
  requesterName: string | null;
  group: { nameNl: string } | null;
};

/**
 * Waarop deze lijst gesorteerd kan worden (R3).
 *
 * De lijst stond vast op startuur, oplopend, en dat is precies de volgorde waarin
 * je "wat komt eraan" leest; ze is geen antwoord op "wat heeft de kar de
 * afgelopen maand gedaan" of "welke ritten staan er nog zonder chauffeur van
 * Jonas". `defaultDir` is de richting waarin een sleutel begint; een tweede klik
 * draait om (`nextSortDir`).
 */
export const TRIP_SORTS = {
  datum: { label: 'Wanneer', defaultDir: 'asc' as const },
  voertuig: { label: 'Voertuig', defaultDir: 'asc' as const },
  chauffeur: { label: 'Chauffeur', defaultDir: 'asc' as const },
  aanvrager: { label: 'Aanvrager', defaultDir: 'asc' as const },
};

export type TripSort = keyof typeof TRIP_SORTS;

export function isTripSort(value: string | undefined): value is TripSort {
  return value !== undefined && value in TRIP_SORTS;
}

/**
 * De vergelijker voor één sorteerkeuze.
 *
 * Het startuur is overal de tiebreak en draait **niet** mee: twee ritten met
 * dezelfde kar op dezelfde dag horen chronologisch te staan, ook wanneer je de
 * voertuigen van z naar a zet. Zonder die vaste tiebreak wisselt de volgorde
 * bovendien per herlaadbeurt.
 *
 * Een rit zonder chauffeur zakt naar onder, in beide richtingen: het is geen
 * naam maar een gat, en het is precies de rij die je zoekt wanneer je op
 * chauffeur sorteert.
 */
export function compareTrips(
  a: SortableTrip,
  b: SortableTrip,
  sort: TripSort,
  dir: SortDir
): number {
  const factor = dir === 'asc' ? 1 : -1;
  const byStart = a.startAt.getTime() - b.startAt.getTime();
  if (sort === 'voertuig') {
    return compareText(a.vehicle.nameNl, b.vehicle.nameNl, dir) || byStart;
  }
  if (sort === 'chauffeur') {
    if ((a.driver === null) !== (b.driver === null)) return a.driver === null ? 1 : -1;
    return compareText(a.driver?.name ?? '', b.driver?.name ?? '', dir) || byStart;
  }
  if (sort === 'aanvrager') {
    return compareText(requesterLabel(a), requesterLabel(b), dir) || byStart;
  }
  return factor * byStart;
}
