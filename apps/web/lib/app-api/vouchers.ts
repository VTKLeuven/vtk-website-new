import "server-only";

import { prisma } from "@vtk/db";

import { logAudit } from "@/lib/audit";
import { academicYearRange } from "@/lib/shift";
import {
  allocateUserShiftReward,
  loadVoucherSources,
  outstandingVouchers,
  ShiftRewardConflictError,
} from "@/lib/shift/rewards.server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import type { AppVoucherEntry } from "./contract";

/**
 * Bonnetjes: verdiend met shiften en met PAL+-sessies, uitgegeven aan een toog.
 *
 * **Het saldo is geen kolom.** Het is de beloning min wat er al van af is,
 * opgeteld over alle shiften en gegeven PAL+-sessies die voorbij zijn
 * (`loadVoucherSources`).
 * Dat is met opzet zo gebleven: er bestaat al een beheerscherm dat bonnetjes in
 * geld uitbetaalt (`/api/shift/reward`) en een afhaalbalie die er afboekt naar
 * de prijs van een broodje, en die schrijven allemaal in diezelfde kolom. Er een tweede
 * saldo naast leggen zou betekenen dat de twee uit elkaar kunnen lopen, en dan is
 * geen van beide nog te vertrouwen.
 *
 * Wat hier bijkomt is enkel de derde weg om ze uit te geven: iemand achter een
 * toog scant de pas van een student en tikt een bedrag in.
 *
 * Het saldo kan op een half eindigen (een broodje kost per half bonnetje, zie
 * `sandwichVoucherCost`). Aan de toog gaan er enkel hele af, net zoals bij het
 * uitbetalen: een half bonnetje bestaat daar niet. Dat half blijft staan voor
 * de afhaalbalie.
 *
 * Een shift uit een werkingsjaar waarin je in het praesidium zat, levert niets
 * op (`earnedShiftReward`): die telt hier dus ook niet mee in het saldo.
 */

export class VoucherError extends Error {
  constructor(readonly code: "NOT_ENOUGH" | "CONFLICT" | "SELF") {
    super(code);
    this.name = "VoucherError";
  }
}

/** Wat deze gebruiker nu kan uitgeven: shiften en PAL+-sessies samen. */
export async function voucherBalance(userId: string, now = new Date()): Promise<number> {
  return outstandingVouchers(await loadVoucherSources(prisma, { userId, completedBefore: now }));
}

/**
 * Saldo, wat er dit academiejaar bij kwam, en het logboek.
 *
 * De historiek is niet de bron van het saldo en telt er ook niet naartoe op:
 * een beheerder die bonnetjes in geld uitbetaalt, verhoogt enkel `rewardPaid` en
 * laat hier niets achter. Dat staat er in de app ook bij, want een lijst die niet
 * optelt naar het getal erboven, is anders gewoon verwarrend.
 *
 * Een PAL+-sessie die je gaf, staat er als "verdiend" bij, met het vak als
 * naam: dezelfde bonnetjes, een andere bron.
 */
export async function voucherOverview(userId: string, now = new Date()) {
  const { start, end } = academicYearRange(now);

  const [sources, theokotRedemptions, redemptions] = await Promise.all([
    loadVoucherSources(prisma, { userId, completedBefore: now }),
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

  const balance = outstandingVouchers(sources);
  let earnedThisYear = 0;
  const history: AppVoucherEntry[] = [];

  for (const source of sources) {
    if (source.endsAt >= start && source.endsAt < end) earnedThisYear += source.reward;
    // Wat niets opleverde (een praesidiumjaar), staat ook niet als verdiend.
    if (source.reward > 0) {
      history.push({
        id: source.key,
        kind: "earned",
        amount: source.reward,
        label: source.label,
        at: source.endsAt.toISOString(),
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
  // Enkel hele bonnetjes aan de toog; zie de uitleg bovenaan.
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
