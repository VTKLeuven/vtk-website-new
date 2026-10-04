import { workingYearOf } from "@vtk/auth";

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

/**
 * Per gebruiker de werkingsjaren waarin hij in een praesidiumpost zat
 * (`praesidiumYears` in `voucherEligibility.ts`).
 */
export type PraesidiumYears = ReadonlyMap<string, ReadonlySet<number>>;

/**
 * Wat een shift deze gebruiker aan bonnetjes oplevert: `Shift.reward`, of nul
 * wanneer hij in het werkingsjaar van die shift in het praesidium zat. De shift
 * telt wel gewoon mee (ranglijst, aantal gedane shiften); enkel de bonnetjes
 * vallen weg. Zie "Praesidium verdient geen bonnetjes" in
 * `docs/design-decisions.md`.
 *
 * Het jaar komt van het begin van de shift (`workingYearOf`, kantelt op 15
 * juli). Een shift van voor iemand praesidium werd, of van erna, levert dus
 * gewoon op.
 */
export function earnedShiftReward(
  participation: { userId: string; reward: number; startTime: Date },
  praesidium: PraesidiumYears,
): number {
  const years = praesidium.get(participation.userId);
  if (!years || years.size === 0) return participation.reward;
  return years.has(workingYearOf(participation.startTime)) ? 0 : participation.reward;
}

export function outstandingShiftReward(
  balance: Pick<ShiftRewardBalance, "reward" | "rewardPaid">,
): number {
  return Math.max(0, balance.reward - balance.rewardPaid);
}

/**
 * Eén bron van bonnetjes in een afboeking. Het saldo komt uit twee soorten
 * bronnen: shiften (`ShiftParticipant`) en PAL+-sessies die je gaf
 * (`PalPlusSessionTutor`). `key` onderscheidt ze ("shift:<id>", "pal:<sessie>");
 * de verdeling zelf kijkt enkel naar beloning en wat er al van af is.
 */
export type VoucherBalance = { key: string; reward: number; rewardPaid: number };
export type VoucherAllocation = { key: string; amount: number; rewardPaid: number; fullyPaid: boolean };

/**
 * Verdeelt een uitbetaling in de aangeleverde volgorde. De caller sorteert de
 * bronnen dus eerst op datum, zodat de oudste openstaande bonnetjes als eerste
 * worden toegekend, of ze nu van een shift of van een PAL+-sessie komen.
 *
 * Aanvaardt halve bonnetjes, want dat is wat een broodje kan kosten. Dat enkel
 * hele bonnetjes fysiek meegegeven worden, is een regel van het uitbetalen en
 * van de toog, en staat daar (`/api/shift/reward`, `redeemVouchers`).
 */
export function allocateVoucherBalances(
  balances: VoucherBalance[],
  requestedAmount: number,
): { allocations: VoucherAllocation[]; available: number; remaining: number } {
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
  const allocations: VoucherAllocation[] = [];

  for (const balance of balances) {
    if (toAllocate === 0) break;
    const outstanding = outstandingShiftReward(balance);
    if (outstanding === 0) continue;

    const amount = Math.min(outstanding, toAllocate);
    const rewardPaid = balance.rewardPaid + amount;
    allocations.push({
      key: balance.key,
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

/** `allocateVoucherBalances` voor enkel shiften, met de shift-id als sleutel. */
export function allocateShiftReward(
  balances: ShiftRewardBalance[],
  requestedAmount: number,
): { allocations: ShiftRewardAllocation[]; available: number; remaining: number } {
  const result = allocateVoucherBalances(
    balances.map((balance) => ({ key: balance.shiftId, reward: balance.reward, rewardPaid: balance.rewardPaid })),
    requestedAmount,
  );
  return {
    ...result,
    allocations: result.allocations.map(({ key, ...rest }) => ({ shiftId: key, ...rest })),
  };
}

/**
 * Wat een PAL+-sessie een tutor oplevert: de momentopname `reward`, nul voor
 * een geannuleerde sessie (die ging niet door), en nul in een praesidiumjaar,
 * dezelfde regel als bij een shift (`earnedShiftReward`).
 */
export function earnedPalPlusReward(
  tutor: { userId: string; reward: number; startsAt: Date; cancelledAt: Date | null },
  praesidium: PraesidiumYears,
): number {
  if (tutor.cancelledAt) return 0;
  return earnedShiftReward({ userId: tutor.userId, reward: tutor.reward, startTime: tutor.startsAt }, praesidium);
}

/**
 * Een correctie of annulering die onder wat al uitgegeven is zakt: het verschil
 * (`excess`) komt uit de andere openstaande bonnetjes (`available`), en wat daar
 * niet in past, vervalt. Een saldo gaat nooit onder nul. Zie "Een correctie gaat
 * nooit onder nul" in docs/design-decisions.md.
 */
export function settleOverspend(excess: number, available: number): { moved: number; forgiven: number } {
  const owed = Math.max(0, excess);
  const moved = Math.min(owed, Math.max(0, available));
  return { moved, forgiven: owed - moved };
}
