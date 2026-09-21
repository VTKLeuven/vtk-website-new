import { describe, expect, it } from 'vitest';
import { driverHourChart, REST_KEY, type HourDriver } from '@/lib/driver-hours';

/** Een chauffeur met uren op de opgegeven uren van de dag. */
function driver(id: string, name: string, colorIndex: number, at: Record<number, number>): HourDriver {
  const perHour = new Array<number>(24).fill(0);
  for (const [hour, value] of Object.entries(at)) perHour[Number(hour)] = value;
  return {
    id,
    name,
    colorIndex,
    hours: perHour.reduce((total, value) => total + value, 0),
    perHour,
  };
}

describe('driverHourChart', () => {
  const jonas = driver('jonas', 'Jonas', 7, { 8: 1, 14: 0.5, 15: 0.75 });
  const lore = driver('lore', 'Lore', 15, { 14: 2, 20: 1 });

  it('geeft een balk per uur, per twee uur of per vier uur', () => {
    expect(driverHourChart([jonas], { bucket: 1, top: 8 }).columns).toHaveLength(24);
    expect(driverHourChart([jonas], { bucket: 2, top: 8 }).columns).toHaveLength(12);
    expect(driverHourChart([jonas], { bucket: 4, top: 8 }).columns).toHaveLength(6);
  });

  it('telt de uren van een blok bij elkaar op', () => {
    const perUur = driverHourChart([jonas], { bucket: 1, top: 8 }).columns;
    expect(perUur[14].hours).toBe(0.5);
    expect(perUur[15].hours).toBe(0.75);

    // 14 en 15 vallen in hetzelfde blok van twee uur.
    const perTwee = driverHourChart([jonas], { bucket: 2, top: 8 }).columns;
    expect(perTwee[7].hours).toBe(1.25);
    expect(perTwee[7].rangeLabel).toBe('14:00 tot 16:00');
  });

  it('noemt het laatste blok tot 24:00 en niet tot 00:00', () => {
    const columns = driverHourChart([jonas], { bucket: 4, top: 8 }).columns;
    expect(columns[5].rangeLabel).toBe('20:00 tot 24:00');
    expect(columns[5].label).toBe('20');
    expect(columns[0].label).toBe('00');
  });

  it('laat een uur zonder ritten leeg, zonder segmenten', () => {
    const columns = driverHourChart([jonas, lore], { bucket: 1, top: 8 }).columns;
    expect(columns[3].hours).toBe(0);
    expect(columns[3].segments).toEqual([]);
  });

  it('stapelt de chauffeurs in dezelfde volgorde als de lijst', () => {
    const columns = driverHourChart([lore, jonas], { bucket: 1, top: 8 }).columns;
    expect(columns[14].segments.map((segment) => segment.name)).toEqual(['Lore', 'Jonas']);
    expect(columns[14].hours).toBe(2.5);
  });

  it('gebruikt de kleur die deze chauffeur in de planning heeft', () => {
    const columns = driverHourChart([jonas], { bucket: 1, top: 8 }).columns;
    expect(columns[8].segments[0].color).toBe('var(--driver-7)');
  });

  it('zet alles buiten de top samen in één segment', () => {
    const chart = driverHourChart([jonas, lore], { bucket: 1, top: 1 });
    const segments = chart.columns[14].segments;
    expect(segments.map((segment) => segment.key)).toEqual(['jonas', REST_KEY]);
    expect(segments[1].hours).toBe(2);
    // De hoogte van de balk blijft kloppen, ook al staat Lore er niet bij naam.
    expect(chart.columns[14].hours).toBe(2.5);
  });

  it('noemt in de legende hoeveel chauffeurs er samen genomen zijn', () => {
    const chart = driverHourChart([jonas, lore], { bucket: 1, top: 1 });
    expect(chart.legend.map((entry) => entry.name)).toEqual(['Jonas', 'Overige chauffeurs (1)']);
    expect(chart.legend[1].hours).toBe(3);
  });

  it('laat de rest weg zolang iedereen bij naam staat', () => {
    const chart = driverHourChart([jonas, lore], { bucket: 1, top: 8 });
    expect(chart.legend.map((entry) => entry.key)).toEqual(['jonas', 'lore']);
    expect(chart.columns.some((column) => column.segments.some((s) => s.key === REST_KEY))).toBe(false);
  });

  it('toont enkel de chauffeur die je meegeeft', () => {
    const chart = driverHourChart([lore], { bucket: 1, top: 8 });
    expect(chart.columns[14].hours).toBe(2);
    expect(chart.legend).toHaveLength(1);
  });

  it('geeft een lege grafiek terug wanneer er niemand reed', () => {
    const chart = driverHourChart([], { bucket: 2, top: 8 });
    expect(chart.legend).toEqual([]);
    expect(chart.columns).toHaveLength(12);
    expect(chart.columns.every((column) => column.hours === 0)).toBe(true);
  });
});
