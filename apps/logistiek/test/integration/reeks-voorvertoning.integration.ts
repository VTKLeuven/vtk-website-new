import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@vtk/db';
import { parseBrusselsDateTime } from '@/lib/reservation-form';

/**
 * De voorvertoning van een reeks ritten (F6.22) met één query voor de hele reeks
 * in plaats van één per herhaling (P4 uit de audit van november 2026).
 *
 * Tegen een echte database: wat telt, is welke ritten de datumvoorwaarde in de
 * query nog teruggeeft, en dat aansluiten blijft mogen.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const session = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>();
  const manager = async () => ({
    user: { id: session.userId, isSuperAdmin: true },
    groups: [],
    permissions: ['logistiek.manage'],
    roleIds: [],
  });
  return { ...actual, requireSession: vi.fn(manager), requireManage: vi.fn(manager) };
});

const { previewTripSeriesAction } = await import('@/app/actions/beheer');

function at(local: string): Date {
  const parsed = parseBrusselsDateTime(local);
  if (!parsed) throw new Error(`geen geldig moment: ${local}`);
  return parsed;
}

describe('voorvertoning van een reeks', () => {
  const ids = { lid: randomUUID(), kar: randomUUID(), auto: randomUUID() };

  async function trip(vehicleId: string, purpose: string, from: string, to: string, status: 'APPROVED' | 'REQUESTED') {
    await prisma.uitleenTransportBooking.create({
      data: {
        userId: ids.lid,
        vehicleId,
        requesterType: 'INTERN',
        purpose,
        contactPhone: '0470 00 00 00',
        pricingMode: 'FREE',
        rateCents: 0,
        status,
        startAt: at(from),
        endAt: at(to),
      },
    });
  }

  beforeAll(async () => {
    session.userId = ids.lid;
    await prisma.user.create({ data: { id: ids.lid, name: 'Reeks Lid', email: `reeks-${ids.lid}@vtk.test` } });
    await prisma.uitleenVehicle.createMany({
      data: [
        { id: ids.kar, code: `reeks-${ids.kar}`, nameNl: 'Reekskar', nameEn: 'Series trailer', pricingMode: 'FREE', rateCents: 0 },
        { id: ids.auto, code: `reeks-${ids.auto}`, nameNl: 'Reeksauto', nameEn: 'Series car', pricingMode: 'FREE', rateCents: 0 },
      ],
    });
    // Week 1: precies over het venster.
    await trip(ids.kar, 'Tafels naar de zaal', '2030-03-05T10:00', '2030-03-05T12:00', 'APPROVED');
    // Week 2: sluit om 12:00 aan, en aansluiten mag.
    await trip(ids.kar, 'Vaten ophalen', '2030-03-12T12:00', '2030-03-12T14:00', 'APPROVED');
    // Week 3: overlapt het laatste uur.
    await trip(ids.kar, 'Podium afbreken', '2030-03-19T11:00', '2030-03-19T13:00', 'APPROVED');
    // Week 4: nog niet goedgekeurd, en een goedgekeurde rit met een ander voertuig.
    await trip(ids.kar, 'Nog niet beslist', '2030-03-26T10:30', '2030-03-26T11:00', 'REQUESTED');
    await trip(ids.auto, 'Andere wagen', '2030-03-26T10:00', '2030-03-26T12:00', 'APPROVED');
    // Ver buiten de reeks: valt al in de query weg.
    await trip(ids.kar, 'Vorig jaar', '2029-03-05T10:00', '2029-03-05T12:00', 'APPROVED');
  });

  afterAll(async () => {
    await prisma.uitleenTransportBooking.deleteMany({ where: { userId: ids.lid } });
    await prisma.uitleenVehicle.deleteMany({ where: { id: { in: [ids.kar, ids.auto] } } });
    await prisma.user.deleteMany({ where: { id: ids.lid } });
  });

  it('toont per herhaling welke goedgekeurde rit van hetzelfde voertuig botst', async () => {
    const result = await previewTripSeriesAction({
      startAt: '2030-03-05T10:00',
      endAt: '2030-03-05T12:00',
      vehicleId: ids.kar,
      // Elke dinsdag (maandag is 0), vier keer.
      repeat: { rule: { kind: 'WEEKLY', weekdays: [1], everyWeeks: 1 }, end: { kind: 'COUNT', count: 4 } },
    });
    if (!result.ok) throw new Error(result.error);

    expect(result.items.map((item) => item.startAt)).toEqual([
      '2030-03-05T10:00',
      '2030-03-12T10:00',
      '2030-03-19T10:00',
      '2030-03-26T10:00',
    ]);
    expect(result.items[0]?.clash).toContain('Tafels naar de zaal');
    expect(result.items[1]?.clash).toBeNull();
    expect(result.items[2]?.clash).toContain('Podium afbreken');
    expect(result.items[3]?.clash).toBeNull();
    expect(result.capped).toBe(false);
  });

  it('kijkt niets na zonder voertuig', async () => {
    const result = await previewTripSeriesAction({
      startAt: '2030-03-05T10:00',
      endAt: '2030-03-05T12:00',
      vehicleId: '',
      repeat: { rule: { kind: 'WEEKLY', weekdays: [1], everyWeeks: 1 }, end: { kind: 'COUNT', count: 2 } },
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.items.every((item) => item.clash === null)).toBe(true);
  });
});
