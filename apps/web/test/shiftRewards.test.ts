import { describe, expect, it } from "vitest";
import {
  allocateShiftReward,
  formatVoucherCount,
  formatVouchers,
  isVoucherAmount,
  outstandingShiftReward,
  wholeVouchers,
} from "@/lib/shift/rewards";

describe("shift reward allocation", () => {
  it("allocates oldest balances first and can partially pay one shift", () => {
    const result = allocateShiftReward(
      [
        { shiftId: "old", reward: 4, rewardPaid: 0 },
        { shiftId: "new", reward: 8, rewardPaid: 0 },
      ],
      10,
    );

    expect(result).toEqual({
      available: 12,
      remaining: 2,
      allocations: [
        { shiftId: "old", amount: 4, rewardPaid: 4, fullyPaid: true },
        { shiftId: "new", amount: 6, rewardPaid: 6, fullyPaid: false },
      ],
    });
  });

  it("continues from an existing partial payment", () => {
    expect(
      allocateShiftReward(
        [{ shiftId: "partial", reward: 5, rewardPaid: 2 }],
        2,
      ),
    ).toEqual({
      available: 3,
      remaining: 1,
      allocations: [
        {
          shiftId: "partial",
          amount: 2,
          rewardPaid: 4,
          fullyPaid: false,
        },
      ],
    });
  });

  it("rejects invalid or excessive amounts", () => {
    const balances = [{ shiftId: "one", reward: 3, rewardPaid: 0 }];
    expect(() => allocateShiftReward(balances, 0)).toThrow(RangeError);
    expect(() => allocateShiftReward(balances, 1.25)).toThrow(RangeError);
    expect(() => allocateShiftReward(balances, 4)).toThrow(RangeError);
  });

  it("books half vouchers, the price of a sandwich, across shifts", () => {
    // 0,5 van de ene shift en 2 van de volgende: een broodje van 2,5.
    expect(
      allocateShiftReward(
        [
          { shiftId: "old", reward: 2, rewardPaid: 1.5 },
          { shiftId: "new", reward: 3, rewardPaid: 0 },
        ],
        2.5,
      ),
    ).toEqual({
      available: 3.5,
      remaining: 1,
      allocations: [
        { shiftId: "old", amount: 0.5, rewardPaid: 2, fullyPaid: true },
        { shiftId: "new", amount: 2, rewardPaid: 2, fullyPaid: false },
      ],
    });
  });

  it("only hands out whole vouchers from a balance that ends on a half", () => {
    expect(wholeVouchers(3.5)).toBe(3);
    expect(wholeVouchers(0.5)).toBe(0);
    expect(wholeVouchers(4)).toBe(4);
    expect(isVoucherAmount(2.5)).toBe(true);
    expect(isVoucherAmount(0.3)).toBe(false);
    expect(isVoucherAmount(-1)).toBe(false);
  });

  it("writes a half with a decimal comma in Dutch", () => {
    expect(formatVouchers(2.5)).toBe("2,5");
    expect(formatVouchers(2.5, "en")).toBe("2.5");
    expect(formatVouchers(3)).toBe("3");
    expect(formatVoucherCount(1)).toBe("1 bonnetje");
    expect(formatVoucherCount(0.5)).toBe("0,5 bonnetjes");
    expect(formatVoucherCount(1, "en")).toBe("1 voucher");
  });

  it("never exposes a negative outstanding balance", () => {
    expect(
      outstandingShiftReward({
        reward: 2,
        rewardPaid: 3,
      }),
    ).toBe(0);
  });
});

describe("PAL+ in hetzelfde saldo", () => {
  it("geeft een tutor de beloning, behalve bij een geannuleerde sessie of in een praesidiumjaar", async () => {
    const { earnedPalPlusReward } = await import("@/lib/shift/rewards");
    const october = new Date("2026-10-12T12:00:00Z");
    const none = new Map<string, Set<number>>();
    const praesidium = new Map([["u1", new Set([2026])]]);
    expect(earnedPalPlusReward({ userId: "u1", reward: 2, startsAt: october, cancelledAt: null }, none)).toBe(2);
    expect(earnedPalPlusReward({ userId: "u1", reward: 2, startsAt: october, cancelledAt: october }, none)).toBe(0);
    expect(earnedPalPlusReward({ userId: "u1", reward: 2, startsAt: october, cancelledAt: null }, praesidium)).toBe(0);
  });

  it("verdeelt over shiften en PAL+-sessies samen, oudste eerst", async () => {
    const { allocateVoucherBalances } = await import("@/lib/shift/rewards");
    const result = allocateVoucherBalances(
      [
        { key: "shift:a", reward: 1, rewardPaid: 0 },
        { key: "pal:s1", reward: 1.5, rewardPaid: 0 },
        { key: "shift:b", reward: 2, rewardPaid: 0 },
      ],
      2,
    );
    expect(result.allocations).toEqual([
      { key: "shift:a", amount: 1, rewardPaid: 1, fullyPaid: true },
      { key: "pal:s1", amount: 1, rewardPaid: 1, fullyPaid: false },
    ]);
    expect(result.remaining).toBe(2.5);
  });

  it("haalt een te veel uitgegeven correctie uit wat nog openstaat, en laat de rest vallen", async () => {
    const { settleOverspend } = await import("@/lib/shift/rewards");
    // Twee teruggenomen, er staat er nog één open: één verschoven, één kwijtgescholden.
    expect(settleOverspend(2, 1)).toEqual({ moved: 1, forgiven: 1 });
    // Genoeg open: alles verschoven, niets vervalt.
    expect(settleOverspend(1.5, 4)).toEqual({ moved: 1.5, forgiven: 0 });
    // Niets open: alles vervalt, het saldo blijft op nul.
    expect(settleOverspend(2, 0)).toEqual({ moved: 0, forgiven: 2 });
    expect(settleOverspend(0, 3)).toEqual({ moved: 0, forgiven: 0 });
  });
});
