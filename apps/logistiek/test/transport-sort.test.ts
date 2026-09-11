import { describe, expect, it } from 'vitest';
import {
  TRIP_SORTS,
  compareTrips,
  isTripSort,
  type SortableTrip,
  type TripSort,
} from '@/lib/transport-sort';
import type { SortDir } from '@/app/beheer/sort';

function trip(over: Omit<Partial<SortableTrip>, 'startAt'> & { startAt: string }): SortableTrip {
  return {
    vehicle: { nameNl: 'Kar' },
    driver: { name: 'Arthur' },
    requesterType: 'INTERN',
    requesterName: null,
    group: { nameNl: 'Feest' },
    ...over,
    startAt: new Date(over.startAt),
  };
}

/** De uren van de gesorteerde lijst, zodat een test leest als de lijst zelf. */
function order(list: SortableTrip[], sort: TripSort, dir: SortDir): string[] {
  return [...list]
    .sort((a, b) => compareTrips(a, b, sort, dir))
    .map((entry) => entry.startAt.toISOString().slice(11, 16));
}

describe('isTripSort', () => {
  it('aanvaardt enkel bestaande sleutels', () => {
    for (const key of Object.keys(TRIP_SORTS)) expect(isTripSort(key)).toBe(true);
    // Een verzonnen sleutel uit de URL mag geen lege lijst geven.
    expect(isTripSort('verzonnen')).toBe(false);
    expect(isTripSort(undefined)).toBe(false);
  });
});

describe('compareTrips op datum', () => {
  const list = [trip({ startAt: '2026-09-14T12:00:00Z' }), trip({ startAt: '2026-09-14T08:00:00Z' })];

  it('sorteert in beide richtingen', () => {
    expect(order(list, 'datum', 'asc')).toEqual(['08:00', '12:00']);
    expect(order(list, 'datum', 'desc')).toEqual(['12:00', '08:00']);
  });
});

describe('compareTrips op voertuig', () => {
  const list = [
    trip({ startAt: '2026-09-14T12:00:00Z', vehicle: { nameNl: 'Kar' } }),
    trip({ startAt: '2026-09-14T08:00:00Z', vehicle: { nameNl: 'Kar' } }),
    trip({ startAt: '2026-09-14T10:00:00Z', vehicle: { nameNl: 'Auto' } }),
  ];

  it('groepeert per voertuig en houdt de uren daarbinnen chronologisch', () => {
    expect(order(list, 'voertuig', 'asc')).toEqual(['10:00', '08:00', '12:00']);
  });

  it('draait enkel de voertuigen om, niet de uren erbinnen', () => {
    // Dat is het punt van een vaste tiebreak: twee ritten met dezelfde kar op
    // dezelfde dag horen chronologisch te staan, wat je ook kiest.
    expect(order(list, 'voertuig', 'desc')).toEqual(['08:00', '12:00', '10:00']);
  });
});

describe('compareTrips op chauffeur', () => {
  const list = [
    trip({ startAt: '2026-09-14T08:00:00Z', driver: { name: 'Zoë' } }),
    trip({ startAt: '2026-09-14T10:00:00Z', driver: null }),
    trip({ startAt: '2026-09-14T12:00:00Z', driver: { name: 'Arthur' } }),
  ];

  it('zet een rit zonder chauffeur onderaan, in beide richtingen', () => {
    // Geen chauffeur is geen naam maar een gat; hem tussen de A en de Z laten
    // vallen maakt precies de rij onvindbaar waarvoor je hierop sorteert.
    expect(order(list, 'chauffeur', 'asc')).toEqual(['12:00', '08:00', '10:00']);
    expect(order(list, 'chauffeur', 'desc')).toEqual(['08:00', '12:00', '10:00']);
  });
});

describe('compareTrips op aanvrager', () => {
  const list = [
    trip({ startAt: '2026-09-14T08:00:00Z', group: { nameNl: 'Feest' } }),
    trip({
      startAt: '2026-09-14T10:00:00Z',
      requesterType: 'WERKGROEP',
      requesterName: 'Alumni',
      group: null,
    }),
  ];

  it('gebruikt hetzelfde label als de lijst zelf toont', () => {
    // `requesterLabel` valt bij intern terug op de post en toont bij elk ander
    // type de vrije naam; sorteren op iets anders dan wat er staat, leest fout.
    expect(order(list, 'aanvrager', 'asc')).toEqual(['10:00', '08:00']);
    expect(order(list, 'aanvrager', 'desc')).toEqual(['08:00', '10:00']);
  });
});

describe('compareTrips is stabiel', () => {
  it('geeft nooit 0 voor twee ritten op een ander uur', () => {
    // Zonder tiebreak wisselt de volgorde per herlaadbeurt, en dan lijkt de
    // lijst elke keer iets anders te zeggen.
    const a = trip({ startAt: '2026-09-14T08:00:00Z' });
    const b = trip({ startAt: '2026-09-14T09:00:00Z' });
    for (const sort of Object.keys(TRIP_SORTS) as TripSort[]) {
      for (const dir of ['asc', 'desc'] as SortDir[]) {
        expect(compareTrips(a, b, sort, dir)).not.toBe(0);
      }
    }
  });
});
