import 'server-only';
import { prisma } from '@vtk/db';
import { CONSUMPTION_LABELS, CONSUMPTION_ORDER, WEEKDAYS } from './fakbar-format';
import { eveningTotals, stockRowTotals, theoreticalRevenue } from './fakbar-totals';

/**
 * De cijfers achter /admin/statistieken.
 *
 * Alles wordt hier uitgerekend uit de tellingen die de fakbar zelf invult; er
 * is geen aparte statistiektabel die uit de pas kan lopen. Dat betekent ook dat
 * een week zonder telling gewoon leeg is en niet als nul meetelt: "we hebben
 * niet geteld" en "er is niets verkocht" zijn twee verschillende dingen, en het
 * tweede zou de gemiddelden omlaag trekken.
 */

/** De periodes die de filter aanbiedt, in weken. `null` is alles. */
export const STAT_RANGES = [
  { key: '4', label: '4 weken', weeks: 4 },
  { key: '12', label: '12 weken', weeks: 12 },
  { key: '26', label: 'Semester', weeks: 26 },
  { key: 'all', label: 'Alles', weeks: null },
] as const;

export type StatRangeKey = (typeof STAT_RANGES)[number]['key'];

export function isStatRange(value: string | undefined): value is StatRangeKey {
  return STAT_RANGES.some((range) => range.key === value);
}

export type WeekPoint = {
  key: string;
  label: string;
  cash: number;
  bancontact: number;
  revenue: number;
  lostRevenue: number;
  /** Wat de stocktelling zegt dat de week had moeten opbrengen, of null. */
  expected: number | null;
  countedEvenings: number;
  evenings: number;
};

export type NamedValue = { key: string; label: string; value: number };

export type FakbarStats = {
  weeks: WeekPoint[];
  byWeekday: NamedValue[];
  lostByCategory: NamedValue[];
  topItems: NamedValue[];
  totals: {
    revenue: number;
    cash: number;
    bancontact: number;
    lostRevenue: number;
    countedEvenings: number;
    /** Gemiddelde ontvangsten per getelde avond. */
    perEvening: number;
    /** Gemiste inkomsten als aandeel van wat er in totaal omging. */
    lostShare: number;
    /** Werkelijk plus gemist, min wat de stocktelling verwachtte. Null zonder telling. */
    delta: number | null;
  };
};

export async function getFakbarStats(range: StatRangeKey): Promise<FakbarStats> {
  const limit = STAT_RANGES.find((entry) => entry.key === range)?.weeks ?? null;

  const weeks = await prisma.fakbarWeek.findMany({
    orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    ...(limit ? { take: limit } : {}),
    include: {
      evenings: {
        orderBy: { date: 'asc' },
        include: {
          cashCount: true,
          consumption: {
            select: { quantity: true, category: true, item: { select: { salesPrice: true } } },
          },
        },
      },
      stockCounts: { include: { item: { select: { id: true, name: true, salesPrice: true } } } },
    },
  });

  // Oud naar nieuw: een grafiek leest van links naar rechts in de tijd.
  weeks.reverse();

  const points: WeekPoint[] = weeks.map((week) => {
    let cash = 0;
    let bancontact = 0;
    let lostRevenue = 0;
    let countedEvenings = 0;

    for (const evening of week.evenings) {
      const totals = eveningTotals(evening);
      cash += evening.cashToSafe;
      bancontact += evening.bancontactRevenue;
      lostRevenue += totals.lostRevenue;
      if (evening.cashCount) countedEvenings += 1;
    }

    return {
      key: `${week.year}-${week.weekNumber}`,
      label: `W${week.weekNumber}`,
      cash,
      bancontact,
      revenue: cash + bancontact,
      lostRevenue,
      expected: theoreticalRevenue(week.stockCounts),
      countedEvenings,
      evenings: week.evenings.length,
    };
  });

  // Per weekdag: welke avond brengt het meest op. Enkel getelde avonden, want
  // een avond zonder telling zou de zondag anders kunstmatig laag zetten.
  const weekdayTotals = new Map<string, number>();
  for (const week of weeks) {
    for (const evening of week.evenings) {
      if (!evening.cashCount) continue;
      const current = weekdayTotals.get(evening.dayOfWeek) ?? 0;
      weekdayTotals.set(evening.dayOfWeek, current + evening.cashToSafe + evening.bancontactRevenue);
    }
  }
  const byWeekday: NamedValue[] = WEEKDAYS.filter((day) => weekdayTotals.has(day)).map((day) => ({
    key: day,
    label: day,
    value: weekdayTotals.get(day) ?? 0,
  }));

  // Gemiste inkomsten per rubriek van het tappersblad, aan verkoopprijs.
  const lostTotals = new Map<string, number>();
  for (const week of weeks) {
    for (const evening of week.evenings) {
      for (const row of evening.consumption) {
        if (row.category === 'VERKOOP') continue;
        const current = lostTotals.get(row.category) ?? 0;
        lostTotals.set(row.category, current + row.quantity * row.item.salesPrice);
      }
    }
  }
  const lostByCategory: NamedValue[] = CONSUMPTION_ORDER.filter((category) => (lostTotals.get(category) ?? 0) > 0)
    .map((category) => ({ key: category, label: CONSUMPTION_LABELS[category], value: lostTotals.get(category) ?? 0 }))
    .sort((a, b) => b.value - a.value);

  // Wat er door de toog ging, aan verkoopprijs, per artikel.
  const itemTotals = new Map<string, { label: string; value: number }>();
  for (const week of weeks) {
    for (const count of week.stockCounts) {
      const sold = stockRowTotals(count).sold;
      if (sold <= 0) continue;
      const current = itemTotals.get(count.item.id);
      const value = sold * count.item.salesPrice;
      itemTotals.set(count.item.id, {
        label: count.item.name,
        value: (current?.value ?? 0) + value,
      });
    }
  }
  const topItems: NamedValue[] = Array.from(itemTotals.entries())
    .map(([key, entry]) => ({ key, label: entry.label, value: entry.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const revenue = points.reduce((sum, point) => sum + point.revenue, 0);
  const cash = points.reduce((sum, point) => sum + point.cash, 0);
  const bancontact = points.reduce((sum, point) => sum + point.bancontact, 0);
  const lost = points.reduce((sum, point) => sum + point.lostRevenue, 0);
  const counted = points.reduce((sum, point) => sum + point.countedEvenings, 0);

  // Enkel de weken waarvan de stocktelling ingevuld is tellen mee in de delta;
  // anders zou elke lege week als een tekort van de hele omzet lezen.
  const withExpected = points.filter((point) => point.expected !== null);
  const delta =
    withExpected.length === 0
      ? null
      : withExpected.reduce((sum, point) => sum + point.revenue + point.lostRevenue - (point.expected ?? 0), 0);

  return {
    weeks: points,
    byWeekday,
    lostByCategory,
    topItems,
    totals: {
      revenue,
      cash,
      bancontact,
      lostRevenue: lost,
      countedEvenings: counted,
      perEvening: counted > 0 ? Math.round(revenue / counted) : 0,
      lostShare: revenue + lost > 0 ? lost / (revenue + lost) : 0,
      delta,
    },
  };
}
