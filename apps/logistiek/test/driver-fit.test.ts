import { describe, expect, it } from 'vitest';
import { fitForTrip, rankDriversForTrip, type FitTrip, type FitWindow } from '@/lib/driver-fit';

/** Een uur op dezelfde dag, in milliseconden. */
const at = (hour: number) => Date.UTC(2026, 10, 19, hour) + 0;
const trip = { id: 'rit', start: at(17), end: at(20) };

function window(driverId: string, from: number, to: number, kind: FitWindow['kind'] = 'JA'): FitWindow {
  return { driverId, start: at(from), end: at(to), kind };
}

describe('fitForTrip', () => {
  it('noemt een venster dat de hele rit dekt "kan"', () => {
    const fit = fitForTrip(trip, 'arne', [window('arne', 16, 22)], []);
    expect(fit.level).toBe('kan');
    expect(fit.window).toEqual({ start: at(16), end: at(22), kind: 'JA' });
  });

  it('telt aaneensluitende vensters samen', () => {
    const fit = fitForTrip(trip, 'arne', [window('arne', 16, 18), window('arne', 18, 22)], []);
    expect(fit.level).toBe('kan');
    expect(fit.window).toEqual({ start: at(16), end: at(22), kind: 'JA' });
  });

  it('laat het zwakste stuk tellen', () => {
    const fit = fitForTrip(trip, 'arne', [window('arne', 16, 18), window('arne', 18, 22, 'LIEVER_NIET')], []);
    expect(fit.level).toBe('liever-niet');
  });

  it('kiest per stuk het beste venster wanneer ze overlappen', () => {
    const fit = fitForTrip(trip, 'arne', [window('arne', 15, 21, 'NOOD'), window('arne', 16, 22)], []);
    expect(fit.level).toBe('kan');
  });

  it('noemt een gat in de dekking "deels", met het grootste stuk', () => {
    const fit = fitForTrip(trip, 'arne', [window('arne', 16, 18), window('arne', 19, 23, 'LIEVER_NIET')], []);
    expect(fit.level).toBe('deels');
    expect(fit.window).toEqual({ start: at(16), end: at(18), kind: 'JA' });
  });

  it('maakt onderscheid tussen niets doorgeven en niet kunnen', () => {
    expect(fitForTrip(trip, 'fien', [], []).level).toBe('onbekend');
    expect(fitForTrip(trip, 'ruben', [window('ruben', 7, 12)], []).level).toBe('niet');
  });

  it('negeert vensters van andere chauffeurs', () => {
    expect(fitForTrip(trip, 'fien', [window('arne', 16, 22)], []).level).toBe('onbekend');
  });

  it('zet wie dan al rijdt achteraan, ook als hij kan', () => {
    const other: FitTrip = { id: 'ander', driverId: 'arne', start: at(18), end: at(19), title: 'Tafels' };
    const fit = fitForTrip(trip, 'arne', [window('arne', 16, 22)], [other]);
    expect(fit.level).toBe('bezet');
    expect(fit.busyWith?.title).toBe('Tafels');
  });

  it('telt de rit zelf niet als bezet', () => {
    const self: FitTrip = { id: 'rit', driverId: 'arne', start: trip.start, end: trip.end, title: 'Deze' };
    expect(fitForTrip(trip, 'arne', [window('arne', 16, 22)], [self]).level).toBe('kan');
  });

  it('telt een rit die net eindigt wanneer deze begint niet als bezet', () => {
    const before: FitTrip = { id: 'ervoor', driverId: 'arne', start: at(15), end: at(17), title: 'Eerder' };
    expect(fitForTrip(trip, 'arne', [window('arne', 16, 22)], [before]).level).toBe('kan');
  });
});

describe('rankDriversForTrip', () => {
  it('zet de chauffeurs op volgorde en houdt de naamvolgorde bij gelijke stand', () => {
    const windows = [
      window('emma', 16, 22, 'LIEVER_NIET'),
      window('jonas', 17, 23),
      window('arne', 16, 22),
      window('ruben', 7, 12),
    ];
    const ranked = rankDriversForTrip(trip, ['arne', 'emma', 'fien', 'jonas', 'ruben'], windows, []);
    expect(ranked.map((fit) => `${fit.driverId}:${fit.level}`)).toEqual([
      'arne:kan',
      'jonas:kan',
      'emma:liever-niet',
      'fien:onbekend',
      'ruben:niet',
    ]);
  });
});
