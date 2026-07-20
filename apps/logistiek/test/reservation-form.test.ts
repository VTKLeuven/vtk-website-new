import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildReservationData,
  parseBrusselsDateTime,
  type ReservationFormInput,
} from '@/lib/reservation-form';

// Mock the Prisma client used by buildReservationData. vi.hoisted lets the mock
// factory reference these spies safely.
const { findItems, findFlesserke } = vi.hoisted(() => ({
  findItems: vi.fn(),
  findFlesserke: vi.fn(),
}));

vi.mock('@vtk/db', () => ({
  prisma: {
    uitleenItem: { findMany: findItems },
    uitleenFlesserkeItem: { findMany: findFlesserke },
  },
}));

type Item = { id: string; name: string; quantity: number; priceCents: number; depositCents: number };
const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  name: `Item ${id}`,
  quantity: 5,
  priceCents: 100,
  depositCents: 500,
  ...over,
});

function baseInput(over: Partial<ReservationFormInput> = {}): ReservationFormInput {
  return {
    requesterType: 'INTERN',
    groupId: 'g1',
    eventName: 'Testactiviteit',
    pickupDate: '2026-07-21',
    returnDate: '2026-07-22',
    lines: [],
    ...over,
  };
}

const ALLOWED = ['g1', 'g2'];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-20T10:00:00.000Z'));
  findItems.mockReset().mockResolvedValue([]);
  findFlesserke.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('parseBrusselsDateTime', () => {
  it('reads a datetime-local value as Brussels wall-clock (summer)', () => {
    // 14:00 Brussels in July (CEST, +2) is 12:00 UTC.
    expect(parseBrusselsDateTime('2026-07-20T14:00')!.toISOString()).toBe('2026-07-20T12:00:00.000Z');
  });

  it('reads Brussels wall-clock in winter (+1)', () => {
    expect(parseBrusselsDateTime('2026-01-20T13:00')!.toISOString()).toBe('2026-01-20T12:00:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(parseBrusselsDateTime('')).toBeNull();
    expect(parseBrusselsDateTime('2026-07-20')).toBeNull();
    expect(parseBrusselsDateTime('2026-07-20 14:00')).toBeNull();
  });
});

describe('buildReservationData — requester validation', () => {
  it('accepts a valid INTERN request and computes totals', async () => {
    findItems.mockResolvedValue([item('i1', { priceCents: 100, depositCents: 500 })]);
    const result = await buildReservationData(baseInput({ lines: [{ itemId: 'i1', quantity: 2 }] }), ALLOWED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scalars.requesterType).toBe('INTERN');
    expect(result.scalars.groupId).toBe('g1');
    expect(result.scalars.requesterName).toBeNull();
    expect(result.scalars.totalPriceCents).toBe(200);
    expect(result.scalars.totalDepositCents).toBe(1000);
    expect(result.lineCreates).toEqual([
      { itemId: 'i1', itemName: 'Item i1', quantity: 2, unitPriceCents: 100, unitDepositCents: 500 },
    ]);
  });

  it('rejects a missing event name', async () => {
    const result = await buildReservationData(baseInput({ eventName: '   ' }), ALLOWED);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('naam') });
  });

  it('rejects an unknown requester type', async () => {
    const result = await buildReservationData(baseInput({ requesterType: 'BOGUS' }), ALLOWED);
    expect(result.ok).toBe(false);
  });

  it('rejects INTERN without a chosen post', async () => {
    const result = await buildReservationData(baseInput({ groupId: '' }), ALLOWED);
    expect(result.ok).toBe(false);
  });

  it('rejects INTERN for a post the member is not in', async () => {
    const result = await buildReservationData(baseInput({ groupId: 'other' }), ALLOWED);
    expect(result.ok).toBe(false);
  });

  it('accepts any post when allowedGroupIds is null (team context)', async () => {
    findItems.mockResolvedValue([item('i1')]);
    const result = await buildReservationData(
      baseInput({ groupId: 'anything', lines: [{ itemId: 'i1', quantity: 1 }] }),
      null
    );
    expect(result.ok).toBe(true);
  });

  it('rejects WERKGROEP without a name', async () => {
    const result = await buildReservationData(
      baseInput({ requesterType: 'WERKGROEP', groupId: undefined, requesterName: '' }),
      ALLOWED
    );
    expect(result.ok).toBe(false);
  });

  it('accepts EXTERN with a name and stores it', async () => {
    findItems.mockResolvedValue([item('i1')]);
    const result = await buildReservationData(
      baseInput({
        requesterType: 'EXTERN',
        groupId: undefined,
        requesterName: 'Jan Extern',
        lines: [{ itemId: 'i1', quantity: 1 }],
      }),
      ALLOWED
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scalars.requesterType).toBe('EXTERN');
    expect(result.scalars.requesterName).toBe('Jan Extern');
    expect(result.scalars.groupId).toBeNull();
  });
});

describe('buildReservationData — date validation', () => {
  it('rejects an unparseable date', async () => {
    const result = await buildReservationData(baseInput({ pickupDate: 'x' }), ALLOWED);
    expect(result.ok).toBe(false);
  });

  it('rejects a pickup date in the past', async () => {
    const result = await buildReservationData(baseInput({ pickupDate: '2026-07-19', returnDate: '2026-07-19' }), ALLOWED);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('verleden') });
  });

  it('rejects a return before pickup', async () => {
    const result = await buildReservationData(baseInput({ pickupDate: '2026-07-22', returnDate: '2026-07-21' }), ALLOWED);
    expect(result.ok).toBe(false);
  });

  it('accepts today as the pickup date (boundary)', async () => {
    findItems.mockResolvedValue([item('i1')]);
    const result = await buildReservationData(
      baseInput({ pickupDate: '2026-07-20', returnDate: '2026-07-20', lines: [{ itemId: 'i1', quantity: 1 }] }),
      ALLOWED
    );
    expect(result.ok).toBe(true);
  });

  it('accepts exactly 14 days but rejects 15', async () => {
    findItems.mockResolvedValue([item('i1')]);
    const ok = await buildReservationData(
      baseInput({ pickupDate: '2026-07-21', returnDate: '2026-08-03', lines: [{ itemId: 'i1', quantity: 1 }] }),
      ALLOWED
    );
    expect(ok.ok).toBe(true); // 14 days inclusive
    const tooLong = await buildReservationData(
      baseInput({ pickupDate: '2026-07-21', returnDate: '2026-08-04' }),
      ALLOWED
    );
    expect(tooLong.ok).toBe(false);
  });
});

describe('buildReservationData — line and stock validation', () => {
  it('rejects duplicate item ids', async () => {
    const result = await buildReservationData(
      baseInput({ lines: [{ itemId: 'i1', quantity: 1 }, { itemId: 'i1', quantity: 1 }] }),
      ALLOWED
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('één keer') });
  });

  it('rejects when a chosen item no longer exists', async () => {
    findItems.mockResolvedValue([]); // item was deactivated/deleted
    const result = await buildReservationData(baseInput({ lines: [{ itemId: 'gone', quantity: 1 }] }), ALLOWED);
    expect(result.ok).toBe(false);
  });

  it('rejects a quantity above available stock', async () => {
    findItems.mockResolvedValue([item('i1', { quantity: 3, name: 'Kabel' })]);
    const result = await buildReservationData(baseInput({ lines: [{ itemId: 'i1', quantity: 4 }] }), ALLOWED);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('3') });
  });

  it('ignores lines with a non-positive quantity', async () => {
    findItems.mockResolvedValue([item('i1')]);
    const result = await buildReservationData(
      baseInput({ lines: [{ itemId: 'i1', quantity: 2 }, { itemId: 'i2', quantity: 0 }] }),
      ALLOWED
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only i1 survives; findItems is queried for i1 only.
    expect(findItems).toHaveBeenCalledWith({ where: { id: { in: ['i1'] }, active: true } });
    expect(result.lineCreates).toHaveLength(1);
  });

  it('rejects a request with no items at all', async () => {
    const result = await buildReservationData(baseInput({ lines: [] }), ALLOWED);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('minstens één') });
  });
});

describe('buildReservationData — flesserke rules', () => {
  it('accepts flesserke for an internal request', async () => {
    findFlesserke.mockResolvedValue([{ id: 'f1', name: 'Cola', quantity: 10 }]);
    const result = await buildReservationData(
      baseInput({ flesserkeLines: [{ itemId: 'f1', quantity: 3 }] }),
      ALLOWED
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flesserkeLineCreates).toEqual([{ flesserkeItemId: 'f1', itemName: 'Cola', quantity: 3 }]);
  });

  it('forbids flesserke for an EXTERN request', async () => {
    findFlesserke.mockResolvedValue([{ id: 'f1', name: 'Cola', quantity: 10 }]);
    const result = await buildReservationData(
      baseInput({
        requesterType: 'EXTERN',
        groupId: undefined,
        requesterName: 'Extern iemand',
        flesserkeLines: [{ itemId: 'f1', quantity: 1 }],
      }),
      ALLOWED
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('interne werking') });
  });

  it('rejects flesserke quantity above stock', async () => {
    findFlesserke.mockResolvedValue([{ id: 'f1', name: 'Cola', quantity: 2 }]);
    const result = await buildReservationData(
      baseInput({ flesserkeLines: [{ itemId: 'f1', quantity: 5 }] }),
      ALLOWED
    );
    expect(result.ok).toBe(false);
  });
});

describe('buildReservationData — field normalisation', () => {
  it('parses eventStart, honours delivery flag and trims/truncates fields', async () => {
    findItems.mockResolvedValue([item('i1')]);
    const longName = 'a'.repeat(400);
    const result = await buildReservationData(
      baseInput({
        lines: [{ itemId: 'i1', quantity: 1 }],
        eventStart: '2026-07-21T14:00',
        eventLocation: '  Aula  ',
        delivery: false,
        deliveryNote: 'should be dropped',
        contactName: longName,
        note: '  hello  ',
      }),
      ALLOWED
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scalars.eventStart?.toISOString()).toBe('2026-07-21T12:00:00.000Z');
    expect(result.scalars.eventLocation).toBe('Aula');
    expect(result.scalars.delivery).toBe(false);
    expect(result.scalars.deliveryNote).toBeNull(); // dropped because delivery is false
    expect(result.scalars.contactName).toHaveLength(300); // truncated to FIELD_MAX
    expect(result.scalars.memberNote).toBe('hello');
  });

  it('rejects an invalid eventStart', async () => {
    findItems.mockResolvedValue([item('i1')]);
    const result = await buildReservationData(
      baseInput({ lines: [{ itemId: 'i1', quantity: 1 }], eventStart: 'not-a-date' }),
      ALLOWED
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a negative expected attendance', async () => {
    const result = await buildReservationData(baseInput({ expectedAttendance: '-3' }), ALLOWED);
    expect(result.ok).toBe(false);
  });
});
