export type ShiftRewardBalance = {
  shiftId: string;
  reward: number;
  rewardPaid: number;
};

export type ShiftRewardAllocation = {
  shiftId: string;
  amount: number;
  rewardPaid: number;
  fullyPaid: boolean;
};

export function outstandingShiftReward(
  balance: Pick<ShiftRewardBalance, "reward" | "rewardPaid">,
): number {
  return Math.max(0, balance.reward - balance.rewardPaid);
}

/**
 * Verdeelt een uitbetaling in de aangeleverde volgorde. De caller sorteert de
 * deelnames dus eerst op shift-datum, zodat de oudste openstaande bonnetjes
 * als eerste worden toegekend.
 */
export function allocateShiftReward(
  balances: ShiftRewardBalance[],
  requestedAmount: number,
): { allocations: ShiftRewardAllocation[]; available: number; remaining: number } {
  const available = balances.reduce(
    (total, balance) => total + outstandingShiftReward(balance),
    0,
  );

  if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) {
    throw new RangeError("requestedAmount must be a positive integer");
  }
  if (requestedAmount > available) {
    throw new RangeError("requestedAmount exceeds the outstanding reward");
  }

  let toAllocate = requestedAmount;
  const allocations: ShiftRewardAllocation[] = [];

  for (const balance of balances) {
    if (toAllocate === 0) break;
    const outstanding = outstandingShiftReward(balance);
    if (outstanding === 0) continue;

    const amount = Math.min(outstanding, toAllocate);
    const rewardPaid = balance.rewardPaid + amount;
    allocations.push({
      shiftId: balance.shiftId,
      amount,
      rewardPaid,
      fullyPaid: rewardPaid >= balance.reward,
    });
    toAllocate -= amount;
  }

  return {
    allocations,
    available,
    remaining: available - requestedAmount,
  };
}

/**
 * De melding wanneer een praesidiumlid in Theokot met bonnetjes wil betalen
 * (`paysWithVouchersBlocked` in `voucherEligibility.ts`). Staat hier en niet
 * daar, omdat de afhaalbalie ze ook in de browser toont.
 */
export const PRAESIDIUM_VOUCHERS_MESSAGE = {
  nl: "Praesidiumleden kunnen in Theokot niet met online bonnetjes betalen. Reken dit gewoon af.",
  en: "Praesidium members cannot pay with online vouchers in Theokot. Please charge this normally.",
} as const;
