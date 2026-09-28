import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bonnetjes afboeken aan een toog.
 *
 * De verdeling zelf (oudste shift eerst) is elders getest; wat hier vastligt is
 * wat er rond die verdeling gebeurt: dat een te laag saldo een antwoord is en
 * geen crash, dat een gelijktijdige tweede scan botst in plaats van dubbel af te
 * boeken, dat niemand bij zichzelf kan afboeken en dat een praesidiumlid niet
 * met bonnetjes betaalt.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  allocate: vi.fn(),
  createRedemption: vi.fn(),
  transaction: vi.fn(),
  logAudit: vi.fn(),
  paysWithVouchersBlocked: vi.fn(),
  // Moet mee gehoist worden: `vi.mock` draait voor de moduleschil, dus een klasse
  // die er in de fabriek gebruikt wordt, mag niet pas hieronder ontstaan.
  FakeConflict: class FakeConflict extends Error {},
}));

vi.mock("@vtk/db", () => ({
  prisma: { user: { findFirst: mocks.findFirst } },
}));

vi.mock("@/lib/shift/rewards.server", () => ({
  allocateUserShiftReward: mocks.allocate,
  ShiftRewardConflictError: mocks.FakeConflict,
}));

vi.mock("@/lib/ticketing/transactions", () => ({
  withSerializableTransaction: (run: (tx: unknown) => unknown) =>
    mocks.transaction({ shiftRewardRedemption: { create: mocks.createRedemption } }, run),
}));

vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

vi.mock("@/lib/shift/voucherEligibility", () => ({
  paysWithVouchersBlocked: mocks.paysWithVouchersBlocked,
}));

import { redeemVouchers, VoucherError } from "@/lib/app-api/vouchers";

describe("bonnetjes afboeken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: "student", name: "Lotte Peeters" });
    mocks.transaction.mockImplementation((tx: unknown, run: (client: unknown) => unknown) => run(tx));
    mocks.allocate.mockResolvedValue({ allocations: [], available: 8, remaining: 5 });
    mocks.paysWithVouchersBlocked.mockResolvedValue(false);
  });

  it("weigert een praesidiumlid en schrijft wie het probeerde in het logboek", async () => {
    mocks.paysWithVouchersBlocked.mockResolvedValue(true);

    await expect(
      redeemVouchers({ userId: "student", amount: 2, processedById: "shifter", place: "Toog" }),
    ).rejects.toMatchObject({ code: "PRAESIDIUM" });

    expect(mocks.paysWithVouchersBlocked).toHaveBeenCalledWith("student");
    expect(mocks.allocate).not.toHaveBeenCalled();
    expect(mocks.createRedemption).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "refuse",
        entity: "shiftReward",
        entityId: "student",
        target: "Lotte Peeters",
      }),
    );
  });

  it("boekt af en schrijft een auditrij", async () => {
    const result = await redeemVouchers({
      userId: "student",
      amount: 3,
      processedById: "shifter",
      place: "Fakbar",
    });

    expect(result).toEqual({ name: "Lotte Peeters", amount: 3, remaining: 5 });
    expect(mocks.allocate).toHaveBeenCalledWith(expect.anything(), {
      userId: "student",
      amount: 3,
    });
    expect(mocks.createRedemption).toHaveBeenCalledWith({
      data: { userId: "student", processedById: "shifter", amount: 3, place: "Fakbar" },
    });
    expect(mocks.logAudit).toHaveBeenCalled();
  });

  /**
   * Wie mag aanvaarden, heeft zelf ook bonnetjes staan. Zijn eigen pas scannen is
   * de kortste weg naar een gratis pint zonder dat er iemand meekijkt; dat is
   * geen theoretisch geval maar de meest voor de hand liggende misbruikvorm.
   */
  it("weigert een afboeking bij jezelf", async () => {
    await expect(
      redeemVouchers({ userId: "shifter", amount: 1, processedById: "shifter" }),
    ).rejects.toThrow(VoucherError);
    expect(mocks.allocate).not.toHaveBeenCalled();
  });

  it("geeft een te laag saldo terug als antwoord en niet als serverfout", async () => {
    mocks.allocate.mockRejectedValue(new RangeError("requestedAmount exceeds the outstanding reward"));

    await expect(
      redeemVouchers({ userId: "student", amount: 40, processedById: "shifter" }),
    ).rejects.toMatchObject({ code: "NOT_ENOUGH" });
  });

  it("meldt een botsing wanneer het saldo intussen veranderde", async () => {
    mocks.allocate.mockRejectedValue(new mocks.FakeConflict());

    await expect(
      redeemVouchers({ userId: "student", amount: 2, processedById: "shifter" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("weigert een bedrag dat geen geheel positief getal is", async () => {
    for (const amount of [0, -1, 1.5, 101]) {
      await expect(
        redeemVouchers({ userId: "student", amount, processedById: "shifter" }),
      ).rejects.toBeInstanceOf(VoucherError);
    }
    expect(mocks.allocate).not.toHaveBeenCalled();
  });

  it("bewaart geen lege plek als lege string", async () => {
    await redeemVouchers({ userId: "student", amount: 1, processedById: "shifter", place: "   " });
    expect(mocks.createRedemption).toHaveBeenCalledWith({
      data: { userId: "student", processedById: "shifter", amount: 1, place: null },
    });
  });
});
