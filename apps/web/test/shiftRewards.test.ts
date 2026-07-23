import { describe, expect, it } from "vitest";
import {
  allocateShiftReward,
  outstandingShiftReward,
} from "@/lib/shift-rewards";

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
    expect(() => allocateShiftReward(balances, 1.5)).toThrow(RangeError);
    expect(() => allocateShiftReward(balances, 4)).toThrow(RangeError);
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
