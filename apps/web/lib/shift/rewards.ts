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

/**
 * Of dit een bedrag in bonnetjes is dat we kunnen afboeken: positief en een
 * veelvoud van een half.
 *
 * Een shift levert hele bonnetjes op, maar een broodje aan de afhaalbalie kost
 * er per half (zie `sandwichVoucherCost` in `lib/theokot.ts`), dus het saldo kan
 * op een half eindigen. Fijner dan een half gaat het nooit: een half is exact in
 * een double, dus `rewardPaid` telt op zonder afrondingsfouten, en de
 * voorwaardelijke update in `allocateUserShiftReward` vergelijkt op gelijkheid.
 */
export function isVoucherAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && Number.isInteger(amount * 2);
}

/**
 * Hoeveel bonnetjes je van dit saldo fysiek kan meegeven: enkel hele. Een half
 * bonnetje bestaat niet op papier; het blijft openstaan voor de afhaalbalie.
 */
export function wholeVouchers(balance: number): number {
  return Math.max(0, Math.floor(balance));
}

/** "2", "2,5" / "2.5": een saldo in bonnetjes, met een halve als decimaal. */
export function formatVouchers(amount: number, locale: "nl" | "en" = "nl"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "nl-BE", {
    maximumFractionDigits: 1,
  }).format(amount);
}

/** "1 bonnetje", "2,5 bonnetjes"; in het Engels "1 voucher", "2.5 vouchers". */
export function formatVoucherCount(amount: number, locale: "nl" | "en" = "nl"): string {
  const word =
    locale === "en" ? (amount === 1 ? "voucher" : "vouchers") : amount === 1 ? "bonnetje" : "bonnetjes";
  return `${formatVouchers(amount, locale)} ${word}`;
}

export function outstandingShiftReward(
  balance: Pick<ShiftRewardBalance, "reward" | "rewardPaid">,
): number {
  return Math.max(0, balance.reward - balance.rewardPaid);
}

/**
 * Verdeelt een uitbetaling in de aangeleverde volgorde. De caller sorteert de
 * deelnames dus eerst op shift-datum, zodat de oudste openstaande bonnetjes
 * als eerste worden toegekend.
 *
 * Aanvaardt halve bonnetjes, want dat is wat een broodje kan kosten. Dat enkel
 * hele bonnetjes fysiek meegegeven worden, is een regel van het uitbetalen en
 * van de toog, en staat daar (`/api/shift/reward`, `redeemVouchers`).
 */
export function allocateShiftReward(
  balances: ShiftRewardBalance[],
  requestedAmount: number,
): { allocations: ShiftRewardAllocation[]; available: number; remaining: number } {
  const available = balances.reduce(
    (total, balance) => total + outstandingShiftReward(balance),
    0,
  );

  if (!isVoucherAmount(requestedAmount)) {
    throw new RangeError("requestedAmount must be a positive multiple of a half");
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
