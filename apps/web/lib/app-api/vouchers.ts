import "server-only";

import { prisma } from "@vtk/db";

import { logAudit } from "@/lib/audit";
import { academicYearRange } from "@/lib/shift";
import { outstandingShiftReward } from "@/lib/shift/rewards";
import { allocateUserShiftReward, ShiftRewardConflictError } from "@/lib/shift/rewards.server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import type { AppVoucherEntry } from "./contract";

/**
 * Bonnetjes: verdiend met shiften, uitgegeven aan een toog.
 *
 * **Het saldo is geen kolom.** Het is `Shift.reward` min
 * `ShiftParticipant.rewardPaid`, opgeteld over alle shiften die voorbij zijn.
 * Dat is met opzet zo gebleven: er bestaat al een beheerscherm dat bonnetjes in
 * geld uitbetaalt (`/api/shift/reward`) en een afhaalbalie die er twee afboekt
 * voor een broodje, en die schrijven allemaal in diezelfde kolom. Er een tweede
 * saldo naast leggen zou betekenen dat de twee uit elkaar kunnen lopen, en dan is
 * geen van beide nog te vertrouwen.
 *
 * Wat hier bijkomt is enkel de derde weg om ze uit te geven: iemand achter een
 * toog scant de pas van een student en tikt een bedrag in.
 */

export class VoucherError extends Error {
  constructor(readonly code: "NOT_ENOUGH" | "CONFLICT" | "SELF") {
    super(code);
    this.name = "VoucherError";
  }
}

/** Wat deze gebruiker nu kan uitgeven. */
export async function voucherBalance(userId: string, now = new Date()): Promise<number> {
  const participations = await prisma.shiftParticipant.findMany({
    where: { userId, shift: { endTime: { lt: now } } },
    select: { rewardPaid: true, shift: { select: { reward: true } } },
  });

  return participations.reduce(
    (total, participation) =>
      total +
      outstandingShiftReward({
        reward: participation.shift.reward,
        rewardPaid: participation.rewardPaid,
      }),
    0,
  );
}

/**
 * Saldo, wat er dit academiejaar bij kwam, en het logboek.
 *
 * De historiek is niet de bron van het saldo en telt er ook niet naartoe op:
 * een beheerder die bonnetjes in geld uitbetaalt, verhoogt enkel `rewardPaid` en
 * laat hier niets achter. Dat staat er in de app ook bij, want een lijst die niet
 * optelt naar het getal erboven, is anders gewoon verwarrend.
 */
export async function voucherOverview(userId: string, now = new Date()) {
  const { start, end } = academicYearRange(now);

  const [participations, theokotRedemptions, redemptions] = await Promise.all([
    prisma.shiftParticipant.findMany({
      where: { userId, shift: { endTime: { lt: now } } },
      select: {
        rewardPaid: true,
        shift: { select: { id: true, name: true, reward: true, endTime: true } },
      },
      orderBy: { shift: { endTime: "desc" } },
    }),
    prisma.theokotVoucherRedemption.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, amount: true, createdAt: true },
    }),
    prisma.shiftRewardRedemption.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, amount: true, place: true, createdAt: true },
    }),
  ]);

  let balance = 0;
  let earnedThisYear = 0;
  const history: AppVoucherEntry[] = [];

  for (const { rewardPaid, shift } of participations) {
    balance += outstandingShiftReward({ reward: shift.reward, rewardPaid });
    if (shift.endTime >= start && shift.endTime < end) earnedThisYear += shift.reward;
    if (shift.reward > 0) {
      history.push({
        id: `shift:${shift.id}`,
        kind: "earned",
        amount: shift.reward,
        label: shift.name,
        at: shift.endTime.toISOString(),
      });
    }
  }

  for (const redemption of theokotRedemptions) {
    history.push({
      id: `theokot:${redemption.id}`,
      kind: "spent",
      amount: redemption.amount,
      label: "Broodje aan de afhaalbalie",
      at: redemption.createdAt.toISOString(),
    });
  }

  for (const redemption of redemptions) {
    history.push({
      id: `toog:${redemption.id}`,
      kind: "spent",
      amount: redemption.amount,
      label: redemption.place?.trim() || "Betaling met bonnetjes",
      at: redemption.createdAt.toISOString(),
    });
  }

  history.sort((a, b) => b.at.localeCompare(a.at));

  return { balance, earnedThisYear, history: history.slice(0, 40) };
}

/**
 * Boekt bonnetjes af voor een betaling aan een toog.
 *
 * Oudste shift eerst, precies zoals het beheerscherm en de afhaalbalie het doen;
 * die volgorde zit in `allocateUserShiftReward` en wordt hier niet overgedaan.
 * De afboeking en de auditrij zitten in één serialiseerbare transactie: zonder
 * dat kan een tweede scanner op hetzelfde moment hetzelfde saldo uitgeven.
 *
 * **Je kan niet bij jezelf afboeken.** Dat is geen theoretisch geval: wie mag
 * aanvaarden, heeft zelf ook bonnetjes, en zijn eigen pas scannen is de kortste
 * weg naar een gratis pint zonder dat er iemand meekijkt.
 */
export async function redeemVouchers({
  userId,
  amount,
  processedById,
  place,
}: {
  userId: string;
  amount: number;
  processedById: string;
  place?: string | null;
}): Promise<{ name: string; amount: number; remaining: number }> {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100) {
    throw new VoucherError("NOT_ENOUGH");
  }
  if (userId === processedById) throw new VoucherError("SELF");

  const user = await prisma.user.findFirst({
    where: { id: userId, active: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!user) throw new Error("NOT_FOUND");

  const trimmedPlace = place?.trim().slice(0, 80) || null;

  let remaining: number;
  try {
    const result = await withSerializableTransaction(async (tx) => {
      const allocation = await allocateUserShiftReward(tx, { userId, amount });
      await tx.shiftRewardRedemption.create({
        data: { userId, processedById, amount, place: trimmedPlace },
      });
      return allocation;
    });
    remaining = result.remaining;
  } catch (error) {
    // `allocateUserShiftReward` gooit een RangeError wanneer het gevraagde bedrag
    // boven het openstaande saldo ligt. Dat is geen serverfout maar het antwoord
    // op de vraag, en de toog hoort het als zodanig te zien.
    if (error instanceof RangeError) throw new VoucherError("NOT_ENOUGH");
    if (error instanceof ShiftRewardConflictError) throw new VoucherError("CONFLICT");
    throw error;
  }

  await logAudit({
    action: "update",
    entity: "shiftReward",
    entityId: userId,
    target: user.name,
    summary: `${amount} bonnetje(s) betaald${trimmedPlace ? ` (${trimmedPlace})` : ""} via de app`,
  });

  return { name: user.name, amount, remaining };
}
