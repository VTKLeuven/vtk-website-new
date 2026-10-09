import { describe, expect, it, vi } from 'vitest';

vi.mock('@vtk/db', () => ({ prisma: {} }));

import { buildShiftHistory, type HistoryShift } from '@/lib/shift/history';
import { nextShiftTier, shiftLadderPosition } from '@/lib/shift/tiers';

let seq = 0;
function shift(start: string, overrides: Partial<HistoryShift> = {}): HistoryShift {
  const startTime = new Date(start);
  return {
    id: `s${seq++}`,
    name: 'Broodjes smeren',
    startTime,
    endTime: new Date(startTime.getTime() + 2 * 3_600_000),
    location: 'Theokot',
    post: 'THEOKOT',
    reward: 2,
    ...overrides,
  };
}

const base = { userId: 'me', deductions: [], praesidium: new Map(), currentYear: 2026 };

describe('buildShiftHistory', () => {
  it('deelt de shiften per werkingsjaar in, nieuwste jaar en nieuwste shift eerst', () => {
    const years = buildShiftHistory({
      ...base,
      shifts: [
        shift('2025-10-01T08:00:00Z'),
        shift('2026-09-20T08:00:00Z'),
        // 14 juli valt nog in het vorige werkingsjaar, 15 juli in het nieuwe.
        shift('2026-07-14T08:00:00Z'),
        shift('2026-10-02T08:00:00Z'),
      ],
    });
    expect(years.map((y) => [y.year, y.count])).toEqual([
      [2026, 2],
      [2025, 2],
    ]);
    expect(years[0].shifts.map((s) => s.startTime.toISOString().slice(0, 10))).toEqual(['2026-10-02', '2026-09-20']);
  });

  it('zet het lopende jaar er altijd bij, ook zonder shiften', () => {
    const years = buildShiftHistory({ ...base, shifts: [shift('2025-10-01T08:00:00Z')] });
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[0]).toMatchObject({ count: 0, vouchers: 0, tier: null, perPost: [] });
    expect(years[0].next?.min).toBe(3);
  });

  it('trekt een afname af van het aantal en dus van de titel, niet van de bonnetjes', () => {
    const shifts = Array.from({ length: 10 }, (_, i) => shift(`2026-09-${String(10 + i).padStart(2, '0')}T08:00:00Z`));
    const [year] = buildShiftHistory({ ...base, shifts, deductions: [{ academicYear: 2026, count: -1 }] });
    expect(year).toMatchObject({ count: 9, deducted: 1, vouchers: 20 });
    expect(year.tier?.nl).toBe('Medewerker');
    expect(year.next?.nl).toBe('Bronze');
  });

  it('toont een jaar met enkel een afname ook, op nul', () => {
    const years = buildShiftHistory({ ...base, shifts: [], deductions: [{ academicYear: 2025, count: -2 }] });
    expect(years.map((y) => [y.year, y.count, y.deducted])).toEqual([
      [2026, 0, 0],
      [2025, 0, 2],
    ]);
  });

  it('geeft geen bonnetjes in een praesidiumjaar, maar telt de shiften wel', () => {
    const [year, previous] = buildShiftHistory({
      ...base,
      praesidium: new Map([['me', new Set([2026])]]),
      shifts: [shift('2026-09-20T08:00:00Z'), shift('2025-10-01T08:00:00Z')],
    });
    expect(year).toMatchObject({ count: 1, vouchers: 0, praesidium: true });
    expect(year.shifts[0].earned).toBe(0);
    expect(previous).toMatchObject({ vouchers: 2, praesidium: false });
  });

  it('telt per post, meeste eerst, met een shift zonder post apart', () => {
    const [year] = buildShiftHistory({
      ...base,
      shifts: [
        shift('2026-09-20T08:00:00Z', { post: 'FAKBAR' }),
        shift('2026-09-21T08:00:00Z'),
        shift('2026-09-22T08:00:00Z'),
        shift('2026-09-23T08:00:00Z', { post: null }),
      ],
    });
    expect(year.perPost).toEqual([
      { post: 'THEOKOT', count: 2 },
      { post: null, count: 1 },
      { post: 'FAKBAR', count: 1 },
    ]);
  });
});

describe('titelladder', () => {
  it('noemt de eerstvolgende titel, en geen boven Platinum', () => {
    expect(nextShiftTier(0)?.min).toBe(3);
    expect(nextShiftTier(12)?.min).toBe(15);
    expect(nextShiftTier(15)?.min).toBe(20);
    expect(nextShiftTier(50)).toBeNull();
  });

  it('zet elke titel in het midden van zijn kolom en schuift er evenredig tussen', () => {
    const center = (i: number) => ((i + 0.5) / 6) * 100;
    expect(shiftLadderPosition(0)).toBe(0);
    expect(shiftLadderPosition(3)).toBeCloseTo(center(0));
    expect(shiftLadderPosition(15)).toBeCloseTo(center(2));
    // Halfweg tussen Bronze (10) en Vaste medewerker (15).
    expect(shiftLadderPosition(12.5)).toBeCloseTo((center(1) + center(2)) / 2);
    expect(shiftLadderPosition(50)).toBeCloseTo(center(5));
    expect(shiftLadderPosition(80)).toBeCloseTo(center(5));
  });
});
