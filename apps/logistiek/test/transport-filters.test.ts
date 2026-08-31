import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  NO_DRIVER,
  countActiveFilters,
  describeFilters,
  filtersToQuery,
  hasActiveFilters,
  parseTransportFilters,
} from '../lib/transport-filters';

describe('parseTransportFilters', () => {
  it('geeft lege filters zonder query', () => {
    expect(parseTransportFilters({})).toEqual(EMPTY_FILTERS);
  });

  it('leest komma-gescheiden lijsten', () => {
    const filters = parseTransportFilters({ voertuig: 'kar,auto', chauffeur: `arthur,${NO_DRIVER}` });
    expect(filters.vehicleIds).toEqual(['kar', 'auto']);
    expect(filters.driverIds).toEqual(['arthur', NO_DRIVER]);
  });

  it('gooit onbekende statussen en aanvragertypes weg', () => {
    // Een verzonnen status uit de URL mag geen query bouwen die niets teruggeeft;
    // dan lijkt een volle week leeg.
    const filters = parseTransportFilters({
      status: 'APPROVED,GEANNULEERD,REJECTED',
      aanvrager: 'INTERN,BUITENAARDS',
    });
    expect(filters.statuses).toEqual(['APPROVED']);
    expect(filters.requesterTypes).toEqual(['INTERN']);
  });

  it('negeert lege stukken', () => {
    expect(parseTransportFilters({ voertuig: 'kar,,  ,auto' }).vehicleIds).toEqual(['kar', 'auto']);
  });
});

describe('filtersToQuery', () => {
  it('laat wat leeg is uit de URL', () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toEqual({});
  });

  it('is de omgekeerde van parseTransportFilters', () => {
    const query = { voertuig: 'kar,auto', chauffeur: NO_DRIVER, status: 'REQUESTED', aanvrager: 'EXTERN' };
    expect(filtersToQuery(parseTransportFilters(query))).toEqual(query);
  });
});

describe('countActiveFilters', () => {
  it('telt per groep, niet per aangevinkte waarde', () => {
    // De teller op de knop zegt "hoeveel dingen filteren er", niet "hoeveel
    // vinkjes staan er"; drie voertuigen aanvinken is één filter.
    const filters = parseTransportFilters({ voertuig: 'a,b,c' });
    expect(countActiveFilters(filters)).toBe(1);
    expect(hasActiveFilters(filters)).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('telt de verborgen evenementenstrook mee', () => {
    const filters = parseTransportFilters({ evenementen: '0' });
    expect(filters.showEvents).toBe(false);
    expect(countActiveFilters(filters)).toBe(1);
  });
});

describe('showAvailability', () => {
  it('staat standaard uit en komt enkel in de URL wanneer ze aanstaat', () => {
    // Omgekeerd aan showEvents: de band is nuttig terwijl je chauffeurs toewijst
    // en de rest van de tijd een extra laag kleur.
    expect(parseTransportFilters({}).showAvailability).toBe(false);
    expect(parseTransportFilters({ beschikbaar: '1' }).showAvailability).toBe(true);
    expect(filtersToQuery(EMPTY_FILTERS).beschikbaar).toBeUndefined();
    expect(filtersToQuery({ ...EMPTY_FILTERS, showAvailability: true })).toEqual({
      beschikbaar: '1',
    });
  });

  it('telt mee als filter en staat in de zin', () => {
    const filters = parseTransportFilters({ beschikbaar: '1' });
    expect(countActiveFilters(filters)).toBe(1);
    expect(describeFilters(filters, { vehicles: new Map(), drivers: new Map() })).toEqual([
      'beschikbaarheid van de chauffeurs zichtbaar',
    ]);
  });
});

describe('showEvents', () => {
  it('staat standaard aan', () => {
    expect(parseTransportFilters({}).showEvents).toBe(true);
    // Enkel een expliciete `0` zet ze uit; een tikfout in de URL mag de
    // evenementen niet stil laten verdwijnen.
    expect(parseTransportFilters({ evenementen: 'nee' }).showEvents).toBe(true);
    expect(parseTransportFilters({ evenementen: '1' }).showEvents).toBe(true);
  });

  it('komt enkel in de URL wanneer ze uitstaat', () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toEqual({});
    expect(filtersToQuery({ ...EMPTY_FILTERS, showEvents: false })).toEqual({ evenementen: '0' });
  });

  it('staat in de zin over wat er verborgen is', () => {
    expect(
      describeFilters({ ...EMPTY_FILTERS, showEvents: false }, {
        vehicles: new Map(),
        drivers: new Map(),
      })
    ).toEqual(['evenementen verborgen']);
  });
});

describe('describeFilters', () => {
  const names = {
    vehicles: new Map([['v1', 'Kar']]),
    drivers: new Map([['d1', 'Arthur']]),
  };

  it('zegt in woorden wat er verborgen is', () => {
    const filters = parseTransportFilters({ voertuig: 'v1', chauffeur: `d1,${NO_DRIVER}` });
    expect(describeFilters(filters, names)).toEqual([
      'enkel Kar',
      'enkel Arthur, ritten zonder chauffeur',
    ]);
  });

  it('zwijgt wanneer er niets gefilterd wordt', () => {
    expect(describeFilters(EMPTY_FILTERS, names)).toEqual([]);
  });

  it('valt terug op een omschrijving voor een id dat niet meer bestaat', () => {
    expect(describeFilters(parseTransportFilters({ voertuig: 'weg' }), names)).toEqual([
      'enkel onbekend voertuig',
    ]);
  });
});
