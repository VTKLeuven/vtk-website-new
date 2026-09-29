import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Praesidiumleden betalen in Theokot niet met online bonnetjes.
 *
 * Wat hier vastligt: wie telt als praesidiumlid (enkel een PRAESIDIUM-post, enkel
 * het lopende werkingsjaar), dat de afhaalbalie het server-side weigert en in het
 * logboek zet, en dat de app-route een nette 403 met een NL/EN-melding geeft.
 * Dat `redeemVouchers` zelf weigert, staat in `appApiVouchers.test.ts`.
 */

const mocks = vi.hoisted(() => {
  const membershipFindFirst = vi.fn();
  const orderFindUnique = vi.fn();
  const voucherRedemptionCreate = vi.fn();
  return {
    membershipFindFirst,
    orderFindUnique,
    voucherRedemptionCreate,
    // Eén client voor de prisma-singleton en de transactie: de check leest in de
    // balie-actie via `tx`, buiten een transactie via `prisma`.
    tx: {
      groupMembership: { findFirst: membershipFindFirst },
      theokotOrder: { findUnique: orderFindUnique },
      theokotVoucherRedemption: { create: voucherRedemptionCreate },
    },
    allocate: vi.fn(),
    logAudit: vi.fn(),
    requirePermission: vi.fn(),
    verifyPassToken: vi.fn(),
    redeemVouchers: vi.fn(),
    FakeConflict: class FakeConflict extends Error {},
    FakeVoucherError: class FakeVoucherError extends Error {
      constructor(readonly code: string) {
        super(code);
      }
    },
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
vi.mock('@/lib/shift/rewards.server', () => ({
  allocateUserShiftReward: mocks.allocate,
  ShiftRewardConflictError: mocks.FakeConflict,
}));
vi.mock('@/lib/app-api/tokens', () => ({ verifyPassToken: mocks.verifyPassToken }));
vi.mock('@/lib/app-api/vouchers', () => ({
  redeemVouchers: mocks.redeemVouchers,
  VoucherError: mocks.FakeVoucherError,
}));

import { currentWorkingYear } from '@vtk/auth';
import { paysWithVouchersBlocked } from '@/lib/shift/voucherEligibility';
import { PRAESIDIUM_VOUCHERS_MESSAGE } from '@/lib/shift/rewards';
import { redeemEmployeeVouchersAction } from '@/app/actions/theokot';
import { POST as redeemRoute } from '@/app/api/app/v1/bonnetjes/inwisselen/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({ user: { id: 'balie', name: 'Balie' } });
});

describe('paysWithVouchersBlocked', () => {
  it('zoekt enkel een PRAESIDIUM-post in het lopende werkingsjaar', async () => {
    mocks.membershipFindFirst.mockResolvedValue({ id: 'm1' });
    const now = new Date('2026-10-01T10:00:00.000Z');

    await expect(paysWithVouchersBlocked('u1', now)).resolves.toBe(true);
    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', year: currentWorkingYear(now), group: { type: 'PRAESIDIUM' } },
      select: { id: true },
    });
  });

  /**
   * Vorig werkingsjaar in het praesidium, nu niet meer: dan betaal je gewoon. De
   * grens is 15 juli, dus dezelfde persoon wisselt van jaar op die dag.
   */
  it('kantelt op 15 juli naar het nieuwe werkingsjaar', async () => {
    mocks.membershipFindFirst.mockResolvedValue(null);

    await paysWithVouchersBlocked('u1', new Date('2027-07-14T10:00:00.000Z'));
    await paysWithVouchersBlocked('u1', new Date('2027-07-16T10:00:00.000Z'));

    const years = mocks.membershipFindFirst.mock.calls.map(([args]) => args.where.year);
    expect(years).toEqual([2026, 2027]);
  });

  it('laat betalen wie geen praesidiumpost heeft', async () => {
    mocks.membershipFindFirst.mockResolvedValue(null);
    await expect(paysWithVouchersBlocked('u1')).resolves.toBe(false);
  });
});

describe('afhaalbalie: bonnetjes voor een broodje', () => {
  beforeEach(() => {
    mocks.orderFindUnique.mockResolvedValue({
      id: 'order1',
      userId: 'student',
      status: 'RESERVED',
      voucherRedemption: null,
      user: { name: 'Lotte Peeters' },
      // €2,30: twee bonnetjes aan een half per 60 cent (`sandwichVoucherCost`).
      lines: [{ unitPriceCents: 230 }],
    });
    mocks.allocate.mockResolvedValue({ allocations: [], available: 6, remaining: 4 });
  });

  it('weigert een praesidiumlid, boekt niets af en logt de poging', async () => {
    mocks.membershipFindFirst.mockResolvedValue({ id: 'm1' });

    const result = await redeemEmployeeVouchersAction('order1', 2);

    expect(result).toEqual({
      ok: false,
      error: PRAESIDIUM_VOUCHERS_MESSAGE.nl,
      code: 'PRAESIDIUM',
    });
    expect(mocks.allocate).not.toHaveBeenCalled();
    expect(mocks.voucherRedemptionCreate).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refuse',
        entity: 'shiftReward',
        entityId: 'student',
        target: 'Lotte Peeters',
      })
    );
  });

  it('laat wie geen praesidiumlid is gewoon betalen', async () => {
    mocks.membershipFindFirst.mockResolvedValue(null);

    const result = await redeemEmployeeVouchersAction('order1', 2);

    expect(result).toEqual({ ok: true, amount: 2, remainingBonnetjes: 4 });
    expect(mocks.voucherRedemptionCreate).toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'refuse' }));
  });

  it('boekt niets af wanneer de prijs afwijkt van wat de balie zei', async () => {
    mocks.membershipFindFirst.mockResolvedValue(null);

    const result = await redeemEmployeeVouchersAction('order1', 2.5);

    expect(result).toEqual({
      ok: false,
      error: 'Dit broodje kost intussen 2 bonnetjes. Er is niets afgeboekt; zoek de student opnieuw op.',
    });
    expect(mocks.allocate).not.toHaveBeenCalled();
    expect(mocks.voucherRedemptionCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/app/v1/bonnetjes/inwisselen', () => {
  function request(locale?: string) {
    const url = `https://vtk.be/api/app/v1/bonnetjes/inwisselen${locale ? `?locale=${locale}` : ''}`;
    return new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pass: 'pass-token-123', amount: 2, place: 'Toog' }),
    });
  }

  beforeEach(() => {
    mocks.verifyPassToken.mockReturnValue({ ok: true, userId: 'student' });
    mocks.redeemVouchers.mockRejectedValue(new mocks.FakeVoucherError('PRAESIDIUM'));
  });

  it('antwoordt 403 met een Nederlandse melding', async () => {
    const response = await redeemRoute(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'PRAESIDIUM',
      message: PRAESIDIUM_VOUCHERS_MESSAGE.nl,
    });
  });

  it('geeft de melding in het Engels met ?locale=en', async () => {
    const response = await redeemRoute(request('en'));

    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(PRAESIDIUM_VOUCHERS_MESSAGE.en);
  });
});
