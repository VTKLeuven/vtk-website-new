import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppShifts } from '@/lib/app-api/contract';

/**
 * De app krijgt de chauffeur van een bijrijdshift onder dezelfde regel als
 * /shift: enkel op een shift waarop je zelf staat (zie docs/design-decisions.md,
 * "Een bijrijdshift kent haar rit").
 */

vi.mock('@vtk/db', () => ({
  prisma: {
    shift: { findMany: vi.fn() },
    uitleenTransportBooking: { findMany: vi.fn() },
  },
  driverPhones: vi.fn(),
}));
vi.mock('@/lib/session', () => ({
  requireSession: vi.fn(async () => ({ user: { id: 'u1' } })),
}));
vi.mock('@/lib/shift/voucherEligibility', () => ({ praesidiumYears: vi.fn(async () => new Map()) }));

const { prisma, driverPhones } = await import('@vtk/db');
const { GET } = await import('@/app/api/app/v1/shiften/route');

const base = {
  description: 'Mee met de kar',
  instructions: null,
  location: 'Loods',
  maxParticipants: 2,
  reward: 1,
  post: 'LOGISTIEK',
  openToInternationals: false,
  nameEn: null,
  descriptionEn: null,
  instructionsEn: null,
  sourceSystem: null,
  transportBookingId: 't1',
  startTime: new Date('2099-12-03T12:00:00Z'),
  endTime: new Date('2099-12-03T14:00:00Z'),
};
const participant = (userId: string) => ({
  userId,
  registeredAt: new Date('2026-11-20T10:00:00Z'),
  replaceable: false,
  user: { name: userId === 'u1' ? 'Jonas' : 'Lien' },
});

describe('de chauffeur in de app', () => {
  beforeEach(() => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([
      { ...base, id: 'mijn', name: 'C&G: heen', participants: [participant('u1')] },
      { ...base, id: 'vrij', name: 'C&G: terug', participants: [participant('u2')] },
    ] as never);
    vi.mocked(prisma.uitleenTransportBooking.findMany).mockResolvedValue([
      { id: 't1', status: 'APPROVED', driver: { id: 'd1', name: 'Arne Janssens' } },
    ] as never);
    vi.mocked(driverPhones).mockResolvedValue(new Map([['d1', { number: '0470 12 34 56', source: 'TEAM' }]]));
  });

  it('staat bij je eigen bijrijdshift, en bij geen andere', async () => {
    const response = await GET(new Request('https://vtk.be/api/app/v1/shiften'));
    const body = (await response.json()) as AppShifts;

    expect(body.mine.map((shift) => shift.id)).toEqual(['mijn']);
    expect(body.mine[0].ride).toEqual({ driver: { name: 'Arne Janssens', phone: '0470 12 34 56' } });
    expect(body.available[0].ride).toBeNull();
    expect(JSON.stringify(body.available)).not.toContain('0470');
  });
});
