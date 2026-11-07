import { describe, expect, it } from 'vitest';
import {
  driverHourChart,
  driverProfiles,
  driverWeekdayChart,
  heatmapFor,
  perWeekday,
  REST_KEY,
  type HourDriver,
} from '@/lib/driver-hours';

/** Een chauffeur met uren op de opgegeven uren van de dag. */
function driver(
  id: string,
  name: string,
  colorIndex: number,
  at: Record<number, number>,
  /** Op welke weekdag (maandag = 0) die uren vallen; standaard maandag. */
  day = 0
): HourDriver {
  const perHour = new Array<number>(24).fill(0);
  const heat = new Array<number>(24 * 7).fill(0);
  for (const [hour, value] of Object.entries(at)) {
    perHour[Number(hour)] = value;
    heat[day * 24 + Number(hour)] = value;
  }
  return {
    id,
    name,
    colorIndex,
    hours: perHour.reduce((total, value) => total + value, 0),
    perHour,
    heat,
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

describe('per weekdag (F6.4)', () => {
  const jonas = driver('jonas', 'Jonas', 7, { 8: 1, 9: 1 }, 0); // maandag, 2 u
  const lore = driver('lore', 'Lore', 15, { 20: 3 }, 4); // vrijdag, 3 u

  it('telt de uren per weekdag op', () => {
    const heat = new Array<number>(168).fill(0);
    heat[2 * 24 + 6] = 1.5;
    heat[2 * 24 + 7] = 0.5;
    heat[5 * 24 + 23] = 1;
    expect(perWeekday(heat)).toEqual([0, 0, 2, 0, 0, 1, 0]);
  });

  it('geeft zeven kolommen, maandag eerst, met een segment per chauffeur', () => {
    const chart = driverWeekdayChart([lore, jonas], { top: 8 });
    expect(chart.columns.map((column) => column.label)).toEqual(['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']);
    expect(chart.columns[0].segments.map((segment) => segment.key)).toEqual(['jonas']);
    expect(chart.columns[4].segments.map((segment) => segment.key)).toEqual(['lore']);
    expect(chart.columns[0].hours).toBe(2);
    expect(chart.columns[4].hours).toBe(3);
    expect(chart.columns[2].segments).toEqual([]);
  });

  it('zet de rest samen en houdt de totalen kloppend', () => {
    const chart = driverWeekdayChart([lore, jonas], { top: 1 });
    expect(chart.columns[0].segments.map((segment) => segment.key)).toEqual([REST_KEY]);
    expect(chart.columns.reduce((total, column) => total + column.hours, 0)).toBe(5);
  });
});

describe('driverProfiles (F6.5)', () => {
  const jonas = driver('jonas', 'Jonas', 7, { 8: 4, 9: 2 });
  const lore = driver('lore', 'Lore', 15, { 20: 1 });
  const piet = driver('piet', 'Piet', 3, { 20: 0.5 });

  it('tekent elke chauffeur tegen dezelfde maat', () => {
    const profiles = driverProfiles([jonas, lore], { by: 'hour', bucket: 1, top: 8 });
    expect(profiles.rows.map((row) => row.key)).toEqual(['jonas', 'lore']);
    // Het hoogste getal van alle rijen, niet van elke rij apart.
    expect(profiles.max).toBe(4);
    expect(profiles.rows[1].values[20]).toBe(1);
  });

  it('zet iedereen buiten de top samen in een rij', () => {
    const profiles = driverProfiles([jonas, lore, piet], { by: 'hour', bucket: 1, top: 1 });
    expect(profiles.rows.map((row) => row.key)).toEqual(['jonas', REST_KEY]);
    expect(profiles.rows[1].values[20]).toBe(1.5);
  });

  it('werkt ook per weekdag en per blok van meerdere uren', () => {
    const perDay = driverProfiles([jonas], { by: 'weekday', bucket: 1, top: 8 });
    expect(perDay.columns).toHaveLength(7);
    expect(perDay.rows[0].values[0]).toBe(6);
    const perFour = driverProfiles([jonas], { by: 'hour', bucket: 4, top: 8 });
    expect(perFour.columns).toHaveLength(6);
    expect(perFour.rows[0].values[2]).toBe(6); // 08:00 tot 12:00
  });

  it('laat een chauffeur zonder uren weg', () => {
    const leeg = driver('leeg', 'Leeg', 1, {});
    const profiles = driverProfiles([jonas, leeg], { by: 'hour', bucket: 1, top: 8 });
    expect(profiles.rows.map((row) => row.key)).toEqual(['jonas']);
  });
});

describe('heatmapFor (F6.6)', () => {
  const total = Array.from({ length: 7 }, () => new Array<number>(24).fill(9));

  it('geeft het totaal zonder gekozen chauffeur', () => {
    expect(heatmapFor(total, null)).toBe(total);
  });

  it('toont enkel de weekdagen en uren van de gekozen chauffeur', () => {
    const lore = driver('lore', 'Lore', 15, { 20: 3 }, 4);
    const map = heatmapFor(total, lore);
    expect(map).toHaveLength(7);
    expect(map[4][20]).toBe(3);
    expect(map[0][20]).toBe(0);
    expect(map.flat().reduce((sum, value) => sum + value, 0)).toBe(3);
  });
});
