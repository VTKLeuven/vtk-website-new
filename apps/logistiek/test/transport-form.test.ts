import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTransportBookings, type TransportFormInput } from '@/lib/transport-form';

const { findVehicles, findFirstVehicle } = vi.hoisted(() => ({
  findVehicles: vi.fn(),
  findFirstVehicle: vi.fn(),
}));

vi.mock('@vtk/db', () => ({
  prisma: {
    uitleenVehicle: { findMany: findVehicles, findFirst: findFirstVehicle },
  },
}));

const vehicle = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  pricingMode: 'FREE',
  rateCents: 0,
  needsVanDriver: false,
  ...over,
});

function input(over: Partial<TransportFormInput> = {}): TransportFormInput {
  return {
    startAt: '2026-11-10T18:00',
    endAt: '2026-11-10T20:00',
    purpose: 'Cantusmateriaal ophalen',
    pickupAddress: '',
    destination: '',
    note: '',
    vehicleIds: ['auto'],
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z'));
  findVehicles.mockReset().mockResolvedValue([vehicle('auto')]);
  findFirstVehicle.mockReset().mockResolvedValue(vehicle('auto'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildTransportBookings: voertuigen (F6.21)', () => {
  it('laat een lid enkel kiezen uit wat het team openzet', async () => {
    await buildTransportBookings(input(), { userId: 'u1', eventId: null });
    expect(findVehicles.mock.calls[0][0].where).toMatchObject({
      active: true,
      requestableByMembers: true,
    });
  });

  it('laat het team elk actief voertuig inplannen', async () => {
    await buildTransportBookings(input(), { userId: 'u1', eventId: null, byTeam: true });
    const where = findVehicles.mock.calls[0][0].where;
    expect(where).toMatchObject({ active: true });
    expect(where).not.toHaveProperty('requestableByMembers');
  });

  it('weigert wanneer het gekozen voertuig voor leden dicht staat', async () => {
    // De poort zit hier en niet enkel in het formulier: de query vindt het
    // voertuig niet, dus komt er minder terug dan er gekozen werd.
    findVehicles.mockResolvedValue([]);
    const built = await buildTransportBookings(input(), { userId: 'u1', eventId: null });
    expect(built.ok).toBe(false);
  });
});

describe('buildTransportBookings: een rit in het verleden (F6.19)', () => {
  const past = { startAt: '2026-11-01T18:00', endAt: '2026-11-01T20:00' };

  it('weigert een lid', async () => {
    const built = await buildTransportBookings(input(past), { userId: 'u1', eventId: null });
    expect(built).toEqual({ ok: false, error: expect.stringContaining('verleden') });
  });

  it('laat het team toe, voor de administratie', async () => {
    const built = await buildTransportBookings(input(past), {
      userId: 'u1',
      eventId: null,
      byTeam: true,
    });
    expect(built.ok).toBe(true);
  });

  it('houdt de andere regels voor het team: het einde komt na het begin', async () => {
    const built = await buildTransportBookings(
      input({ startAt: '2026-11-01T18:00', endAt: '2026-11-01T17:00' }),
      { userId: 'u1', eventId: null, byTeam: true }
    );
    expect(built.ok).toBe(false);
  });
});

describe('buildTransportBookings: extra info van Logistiek (F6.9)', () => {
  it('neemt ze enkel over wanneer het team de rit maakt', async () => {
    const team = await buildTransportBookings(input({ adminNote: 'Sleutel bij Jan' }), {
      userId: 'u1',
      eventId: null,
      byTeam: true,
    });
    expect(team.ok && team.bookings[0]).toMatchObject({ adminNote: 'Sleutel bij Jan' });
  });

  it('laat een lid niets onder de naam van Logistiek zetten', async () => {
    // Een lid kan het veld meesturen; het mag niet in de rit terechtkomen.
    const member = await buildTransportBookings(input({ adminNote: 'Goedgekeurd door Logistiek' }), {
      userId: 'u1',
      eventId: null,
    });
    expect(member.ok && member.bookings[0]).not.toHaveProperty('adminNote');
  });
});

describe('buildTransportBookings: de post kiest zelf de chauffeur (F6.10)', () => {
  it('zet de aanvragende post op een voertuig dat geen kar is', async () => {
    const built = await buildTransportBookings(input(), {
      userId: 'u1',
      eventId: null,
      assignedGroupId: 'sport',
    });
    expect(built.ok && built.bookings[0]).toMatchObject({ assignedGroupId: 'sport' });
  });

  it('zet niets op de kar: die vraagt een goedgekeurde karchauffeur', async () => {
    findVehicles.mockResolvedValue([vehicle('kar', { needsVanDriver: true })]);
    const built = await buildTransportBookings(input({ vehicleIds: ['kar'] }), {
      userId: 'u1',
      eventId: null,
      assignedGroupId: 'sport',
    });
    expect(built.ok && built.bookings[0]).not.toHaveProperty('assignedGroupId');
  });

  it('zet niets zonder post', async () => {
    const built = await buildTransportBookings(input(), {
      userId: 'u1',
      eventId: null,
      assignedGroupId: null,
    });
    expect(built.ok && built.bookings[0]).not.toHaveProperty('assignedGroupId');
  });

  it('bij een kar en een auto samen krijgt enkel de auto de post', async () => {
    findVehicles.mockResolvedValue([
      vehicle('kar', { needsVanDriver: true }),
      vehicle('auto'),
    ]);
    const built = await buildTransportBookings(input({ vehicleIds: ['kar', 'auto'] }), {
      userId: 'u1',
      eventId: null,
      assignedGroupId: 'sport',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const byVehicle = new Map(built.bookings.map((booking) => [booking.vehicleId, booking]));
    expect(byVehicle.get('auto')).toMatchObject({ assignedGroupId: 'sport' });
    expect(byVehicle.get('kar')).not.toHaveProperty('assignedGroupId');
  });
});
