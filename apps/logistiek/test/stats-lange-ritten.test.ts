import { describe, expect, it, vi } from 'vitest';
import { countsInStats, DEFAULT_STATS_MAX_TRIP_HOURS } from '@/lib/uitleen';

/**
 * Een rit langer dan de grens (standaard 5 uur) telt niet mee in de
 * statistieken: zo lang rijdt niemand. Zie docs/design-decisions.md,
 * "Lange ritten tellen niet mee in de statistieken".
 */

vi.mock('@vtk/db', () => ({
  prisma: {
    uitleenTransportBooking: { findMany: vi.fn() },
    uitleenVehicle: { findMany: vi.fn(async () => [{ id: 'kar', nameNl: 'Kar' }]) },
  },
}));
vi.mock('@/lib/uitleen-server', () => ({ driverColorOverrides: vi.fn(async () => ({})) }));

const at = (iso: string) => new Date(iso);
const HOUR = 60 * 60 * 1000;

describe('countsInStats', () => {
  it('staat standaard op vijf uur', () => {
    expect(DEFAULT_STATS_MAX_TRIP_HOURS).toBe(5);
  });

  it('telt een rit van precies de grens nog mee', () => {
    expect(countsInStats(at('2026-11-20T13:00:00Z'), at('2026-11-20T18:00:00Z'))).toBe(true);
  });

  it('laat een rit vallen die een kwartier langer duurt', () => {
    expect(countsInStats(at('2026-11-20T13:00:00Z'), at('2026-11-20T18:15:00Z'))).toBe(false);
  });

  it('volgt een andere grens', () => {
    const start = at('2026-11-20T08:00:00Z');
    const end = new Date(start.getTime() + 7 * HOUR);
    expect(countsInStats(start, end, 5)).toBe(false);
    expect(countsInStats(start, end, 8)).toBe(true);
  });
});

describe('transportStats met een lange rit', () => {
  const booking = (id: string, startIso: string, hours: number, status = 'APPROVED') => ({
    id,
    startAt: at(startIso),
    endAt: new Date(at(startIso).getTime() + hours * HOUR),
    status,
    purpose: id,
    requesterType: 'INTERN',
    requesterName: null,
    vehicleId: 'kar',
    driverId: 'd1',
    groupId: 'sport',
    vehicle: { nameNl: 'Kar', needsDriver: true },
    driver: { name: 'Arne' },
    group: { nameNl: 'Sport' },
  });

  it('telt ze nergens mee, maar zegt hoeveel het er zijn', async () => {
    const { prisma } = await import('@vtk/db');
    vi.mocked(prisma.uitleenTransportBooking.findMany)
      .mockResolvedValueOnce([
        booking('kort', '2026-11-20T09:00:00Z', 2),
        booking('weekend', '2026-11-21T09:00:00Z', 48),
        booking('geannuleerd', '2026-11-22T09:00:00Z', 30, 'CANCELLED'),
      ] as never)
      // De vorige periode, voor de trendpijl: ook daar valt de lange rit weg.
      .mockResolvedValueOnce([
        { startAt: at('2026-10-20T09:00:00Z'), endAt: at('2026-10-20T12:00:00Z'), driverId: 'd1' },
        { startAt: at('2026-10-21T09:00:00Z'), endAt: at('2026-10-22T09:00:00Z'), driverId: 'd1' },
      ] as never);

    const { transportStats } = await import('@/lib/uitleen-stats');
    const stats = await transportStats({
      from: at('2026-11-15T00:00:00Z'),
      to: at('2026-11-30T00:00:00Z'),
      vehicleIds: [],
      groupIds: [],
      maxTripHours: 5,
    });

    expect(stats.totals.trips).toBe(1);
    expect(stats.totals.hours).toBe(2);
    expect(stats.totals.tooLong).toBe(1);
    expect(stats.perDriver[0].hours).toBe(2);
    expect(stats.perGroup[0].hours).toBe(2);
    // De drukteweergave kent enkel de twee uur van de korte rit.
    expect(stats.heatmap.flat().reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(stats.previous).toMatchObject({ trips: 1, hours: 3 });

    // In de lijst staan ze nog, met de reden.
    expect(stats.rows.map((row) => [row.id, row.excluded])).toEqual([
      ['kort', false],
      ['weekend', true],
      ['geannuleerd', false],
    ]);
  });
});

describe('transportStats in ritten', () => {
  const ride = (id: string, startIso: string, hours: number, driverId: string | null = 'd1') => ({
    id,
    startAt: at(startIso),
    endAt: new Date(at(startIso).getTime() + hours * HOUR),
    status: 'APPROVED',
    purpose: id,
    requesterType: 'INTERN',
    requesterName: null,
    vehicleId: 'kar',
    driverId,
    groupId: 'sport',
    vehicle: { nameNl: 'Kar', needsDriver: true },
    driver: driverId ? { name: 'Arne' } : null,
    group: { nameNl: 'Sport' },
  });

  it('telt elke rit één keer, op het uur waarop ze vertrekt', async () => {
    const { prisma } = await import('@vtk/db');
    vi.mocked(prisma.uitleenTransportBooking.findMany)
      // Maandag 23 november 2026: 09:00 Brusselse tijd is 08:00 UTC.
      .mockResolvedValueOnce([
        ride('ochtend', '2026-11-23T08:00:00Z', 3),
        ride('middag', '2026-11-23T12:00:00Z', 1),
        ride('zonder', '2026-11-24T08:00:00Z', 2, null),
      ] as never)
      .mockResolvedValueOnce([] as never);

    const { transportStats } = await import('@/lib/uitleen-stats');
    const stats = await transportStats({
      from: at('2026-11-15T00:00:00Z'),
      to: at('2026-11-30T00:00:00Z'),
      vehicleIds: [],
      groupIds: [],
      maxTripHours: 5,
    });

    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    // De rit van drie uur telt één keer, op maandag 09:00, en niet in drie vakjes.
    expect(stats.heatmapTrips[0][9]).toBe(1);
    expect(stats.heatmapTrips[0][10]).toBe(0);
    expect(sum(stats.heatmapTrips.flat())).toBe(3);

    const driver = stats.perDriver[0];
    expect(driver.trips).toBe(2);
    expect(sum(driver.perHourTrips)).toBe(2);
    expect(sum(driver.heatTrips)).toBe(2);
    expect(driver.perVehicleTrips).toEqual({ kar: 2 });
    expect(stats.totals.tripsWithoutDriver).toBe(1);
  });
});
