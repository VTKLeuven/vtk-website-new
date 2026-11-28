import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Het nummer van de chauffeur van een bijrijdshift is voor wie op de shift
 * staat, en voor niemand anders (zie docs/design-decisions.md, "Een bijrijdshift
 * kent haar rit"). `registeredShifts` is de enige weg waarlangs het naar /shift
 * gaat; `availableShifts` (wat je nog kan opnemen) draagt het nooit.
 */

vi.mock('@vtk/db', () => ({
  prisma: {
    shift: { findMany: vi.fn() },
    uitleenTransportBooking: { findMany: vi.fn() },
  },
  driverPhones: vi.fn(),
}));
vi.mock('@/lib/shift/voucherEligibility', () => ({ praesidiumYears: vi.fn(async () => new Map()) }));

const { prisma, driverPhones } = await import('@vtk/db');
const { availableShifts, registeredShifts } = await import('@/lib/shift/lists');

const shiftRow = {
  id: 's1',
  name: 'C&G: bijrijden',
  startTime: new Date('2026-12-03T12:00:00Z'),
  endTime: new Date('2026-12-03T14:00:00Z'),
  location: 'Loods',
  description: 'Mee met de kar',
  maxParticipants: 2,
  reward: 1,
  post: 'LOGISTIEK',
  transportBookingId: 't1',
  participants: [
    { userId: 'u1', payedOut: false, registeredAt: new Date('2026-11-20T10:00:00Z'), replaceable: false, user: { name: 'Jonas' } },
  ],
};

describe('de chauffeur van een bijrijdshift', () => {
  beforeEach(() => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([shiftRow] as never);
    vi.mocked(prisma.uitleenTransportBooking.findMany).mockResolvedValue([
      { id: 't1', status: 'APPROVED', driver: { id: 'd1', name: 'Arne Janssens' } },
    ] as never);
    vi.mocked(driverPhones).mockResolvedValue(new Map([['d1', { number: '0470 12 34 56', source: 'TEAM' }]]));
  });

  it('staat bij je eigen shift, met het nummer', async () => {
    const [shift] = await registeredShifts('u1', 'u1');
    expect(shift.ride).toEqual({ driver: { name: 'Arne Janssens', phone: '0470 12 34 56' } });
  });

  it('gaat niet mee wanneer iemand anders je shiften bekijkt', async () => {
    vi.mocked(prisma.uitleenTransportBooking.findMany).mockClear();
    vi.mocked(driverPhones).mockClear();
    const [shift] = await registeredShifts('u1', 'beheerder');
    expect(shift.ride).toBeNull();
    // Niet enkel weggelaten in het antwoord: de rit en het nummer worden dan
    // ook niet opgevraagd.
    expect(prisma.uitleenTransportBooking.findMany).not.toHaveBeenCalled();
    expect(driverPhones).not.toHaveBeenCalled();
  });

  it('staat nooit bij een shift die je nog kan opnemen', async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([{ ...shiftRow, participants: [] }] as never);
    const [shift] = await availableShifts('u2');
    expect(shift).not.toHaveProperty('ride');
    expect(JSON.stringify(shift)).not.toContain('0470');
  });
});
