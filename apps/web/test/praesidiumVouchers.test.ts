import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Praesidium verdient geen bonnetjes met zijn shiften, maar de shiften tellen
 * gewoon mee.
 *
 * Wat hier vastligt: welke shift niets oplevert (een shift in een werkingsjaar
 * waarin je in een PRAESIDIUM-post zat, gerekend vanaf het begin van de shift en
 * kantelend op 15 juli), hoe de lidmaatschappen opgehaald worden, dat een
 * afboeking zo'n shift overslaat, en dat een praesidiumlid aan de afhaalbalie
 * gewoon mag betalen met wat hij daarvoor verdiende.
 */

const mocks = vi.hoisted(() => {
  const membershipFindMany = vi.fn();
  const participantFindMany = vi.fn();
  const participantUpdateMany = vi.fn();
  const orderFindUnique = vi.fn();
  const voucherRedemptionCreate = vi.fn();
  const tutorFindMany = vi.fn();
  return {
    membershipFindMany,
    participantFindMany,
    participantUpdateMany,
    orderFindUnique,
    voucherRedemptionCreate,
    // Eén client voor de prisma-singleton en de transactie.
    tx: {
      groupMembership: { findMany: membershipFindMany },
      shiftParticipant: { findMany: participantFindMany, updateMany: participantUpdateMany },
      // Het saldo telt ook de PAL+-sessies die iemand gaf; hier zijn er geen.
      palPlusSessionTutor: { findMany: tutorFindMany },
      theokotOrder: { findUnique: orderFindUnique },
      theokotVoucherRedemption: { create: voucherRedemptionCreate },
    },
    allocate: vi.fn(),
    logAudit: vi.fn(),
    requirePermission: vi.fn(),
    FakeConflict: class FakeConflict extends Error {},
  };
});

vi.mock('@vtk/db', () => ({ prisma: mocks.tx }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/session', () => ({
  requirePermission: mocks.requirePermission,
  requireSession: vi.fn(),
}));
vi.mock('@/lib/ticketing/transactions', () => ({
  withSerializableTransaction: (run: (client: unknown) => unknown) => run(mocks.tx),
}));
// De balie-actie krijgt een nep-verdeling; de echte staat hieronder apart
// (`vi.importActual`), zodat die tegen dezelfde nep-database draait.
vi.mock('@/lib/shift/rewards.server', () => ({
  allocateUserShiftReward: mocks.allocate,
  ShiftRewardConflictError: mocks.FakeConflict,
}));

import { earnedShiftReward } from '@/lib/shift/rewards';
import { praesidiumYears } from '@/lib/shift/voucherEligibility';
import { redeemEmployeeVouchersAction } from '@/app/actions/theokot';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({ user: { id: 'balie', name: 'Balie' } });
});

/** 1 oktober 2026: werkingsjaar 2026 ("26-27"). */
const OCT_2026 = new Date('2026-10-01T10:00:00.000Z');
/** 1 maart 2026: nog werkingsjaar 2025 ("25-26"), van voor er roldata was. */
const MAR_2026 = new Date('2026-03-01T10:00:00.000Z');

describe('earnedShiftReward', () => {
  const inPraesidium2026 = new Map([['u1', new Set([2026])]]);

  it('geeft de volle beloning aan wie geen praesidiumpost heeft', () => {
    expect(earnedShiftReward({ userId: 'u2', reward: 3, startTime: OCT_2026 }, inPraesidium2026)).toBe(3);
  });

  it('geeft niets voor een shift in een praesidiumjaar', () => {
    expect(earnedShiftReward({ userId: 'u1', reward: 3, startTime: OCT_2026 }, inPraesidium2026)).toBe(0);
  });

  /**
   * `currentWorkingYear` klemt alles van voor 15 juli 2026 op 2026. Met die
   * functie zou een shift van maart 2026 als praesidiumshift tellen voor wie pas
   * in 26-27 praesidium werd.
   */
  it('laat een shift van voor het praesidiumjaar gewoon opleveren', () => {
    expect(earnedShiftReward({ userId: 'u1', reward: 3, startTime: MAR_2026 }, inPraesidium2026)).toBe(3);
  });

  it('kantelt op 15 juli, in Brusselse tijd', () => {
    const inPraesidium2027 = new Map([['u1', new Set([2027])]]);
    // 14 juli 23:30 in Brussel is nog 26-27; 15 juli 00:30 is 27-28.
    const lastEvening = new Date('2027-07-14T21:30:00.000Z');
    const firstMorning = new Date('2027-07-14T22:30:00.000Z');
    expect(earnedShiftReward({ userId: 'u1', reward: 2, startTime: lastEvening }, inPraesidium2027)).toBe(2);
    expect(earnedShiftReward({ userId: 'u1', reward: 2, startTime: firstMorning }, inPraesidium2027)).toBe(0);
  });
});

describe('praesidiumYears', () => {
  it('zoekt enkel PRAESIDIUM-posten en groepeert de jaren per gebruiker', async () => {
    mocks.membershipFindMany.mockResolvedValue([
      { userId: 'u1', year: 2026 },
      { userId: 'u1', year: 2027 },
      { userId: 'u2', year: 2026 },
    ]);

    const years = await praesidiumYears(['u1', 'u2', 'u1']);

    expect(mocks.membershipFindMany).toHaveBeenCalledWith({
      where: { group: { type: 'PRAESIDIUM' }, userId: { in: ['u1', 'u2'] } },
      select: { userId: true, year: true },
    });
    expect([...(years.get('u1') ?? [])]).toEqual([2026, 2027]);
    expect([...(years.get('u2') ?? [])]).toEqual([2026]);
  });

  it('vraagt niets op voor een lege lijst', async () => {
    await expect(praesidiumYears([])).resolves.toEqual(new Map());
    expect(mocks.membershipFindMany).not.toHaveBeenCalled();
  });
});

describe('afboeken slaat een praesidiumshift over', () => {
  async function realAllocate() {
    const actual = await vi.importActual<typeof import('@/lib/shift/rewards.server')>(
      '@/lib/shift/rewards.server',
    );
    return actual.allocateUserShiftReward;
  }

  beforeEach(() => {
    mocks.membershipFindMany.mockResolvedValue([{ userId: 'u1', year: 2026 }]);
    mocks.tx.palPlusSessionTutor.findMany.mockResolvedValue([]);
    mocks.participantFindMany.mockResolvedValue([
      // Van voor het praesidiumjaar: 3 open.
      { shiftId: 'old', rewardPaid: 0, shift: { reward: 3, startTime: MAR_2026, endTime: MAR_2026, name: 'Oud' } },
      // In het praesidiumjaar: levert niets op, dus ook niets open.
      { shiftId: 'now', rewardPaid: 0, shift: { reward: 2, startTime: OCT_2026, endTime: OCT_2026, name: 'Nu' } },
    ]);
    mocks.participantUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('boekt enkel af van wat hij verdiende', async () => {
    const allocate = await realAllocate();

    const result = await allocate(mocks.tx as never, { userId: 'u1', amount: 3 });

    expect(result.available).toBe(3);
    expect(result.allocations.map((a) => a.key)).toEqual(['shift:old']);
    expect(mocks.participantUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('weigert meer dan dat, ook al staat de shift van dit jaar nog open', async () => {
    const allocate = await realAllocate();

    await expect(allocate(mocks.tx as never, { userId: 'u1', amount: 4 })).rejects.toThrow(RangeError);
    expect(mocks.participantUpdateMany).not.toHaveBeenCalled();
  });
});

describe('afhaalbalie: bonnetjes voor een broodje', () => {
  beforeEach(() => {
    mocks.orderFindUnique.mockResolvedValue({
      id: 'order1',
      userId: 'student',
      status: 'RESERVED',
      voucherRedemption: null,
      // €2,30: twee bonnetjes aan een half per 60 cent (`sandwichVoucherCost`).
      lines: [{ unitPriceCents: 230 }],
    });
    mocks.allocate.mockResolvedValue({ allocations: [], available: 6, remaining: 4 });
  });

  it('laat een praesidiumlid betalen met wat hij verdiende', async () => {
    mocks.membershipFindMany.mockResolvedValue([{ userId: 'student', year: 2026 }]);

    const result = await redeemEmployeeVouchersAction('order1', 2);

    expect(result).toEqual({ ok: true, amount: 2, remainingBonnetjes: 4 });
    expect(mocks.voucherRedemptionCreate).toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'refuse' }));
  });

  it('boekt niets af wanneer de prijs afwijkt van wat de balie zei', async () => {
    const result = await redeemEmployeeVouchersAction('order1', 2.5);

    expect(result).toEqual({
      ok: false,
      error: 'Dit broodje kost intussen 2 bonnetjes. Er is niets afgeboekt; zoek de student opnieuw op.',
    });
    expect(mocks.allocate).not.toHaveBeenCalled();
    expect(mocks.voucherRedemptionCreate).not.toHaveBeenCalled();
  });
});
