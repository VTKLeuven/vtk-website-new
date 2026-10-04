import "server-only";

import type { Prisma } from "@prisma/client";
import {
  allocateVoucherBalances,
  earnedPalPlusReward,
  earnedShiftReward,
  outstandingShiftReward,
  settleOverspend,
} from "@/lib/shift/rewards";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";
import { palPlusCourseLabel } from "@/lib/palPlus";

export class ShiftRewardConflictError extends Error {
  constructor() {
    super("SHIFT_REWARD_CHANGED");
  }
}

/**
 * Eén bron van bonnetjes van één gebruiker: een shift waaraan hij meedeed, of
 * een PAL+-sessie die hij gaf. `reward` is wat ze echt oplevert (nul in een
 * praesidiumjaar, nul voor een geannuleerde sessie), niet de kale beloning.
 */
export type VoucherSource = {
  key: string;
  kind: "shift" | "pal";
  /** De shift-id of de sessie-id. */
  refId: string;
  reward: number;
  rewardPaid: number;
  endsAt: Date;
  label: string;
};

/**
 * Alle bronnen van bonnetjes van één gebruiker die voorbij zijn, oudste eerst.
 *
 * **Dit is de enige plek die het saldo samenstelt.** Shiften en PAL+-sessies
 * vormen één saldo, op dezelfde plaatsen uit te geven; wie het saldo nodig heeft,
 * gaat hierlangs, zodat er nergens een plek is die PAL+ vergeet.
 *
 * Zonder `shiftIds` en `palSessionIds` telt alles mee. Geef je er één van mee,
 * dan tellen enkel die bronnen: een lijst die ontbreekt, betekent dan "geen van
 * die soort" (het beheerscherm Bonnetjes betaalt een gekozen reeks uit).
 */
export async function loadVoucherSources(
  db: Prisma.TransactionClient,
  {
    userId,
    completedBefore = new Date(),
    shiftIds,
    palSessionIds,
  }: {
    userId: string;
    completedBefore?: Date;
    shiftIds?: string[];
    palSessionIds?: string[];
  },
): Promise<VoucherSource[]> {
  const restricted = shiftIds !== undefined || palSessionIds !== undefined;
  const wantShifts = !restricted || (shiftIds?.length ?? 0) > 0;
  const wantPal = !restricted || (palSessionIds?.length ?? 0) > 0;

  const [participations, tutorRows, praesidium] = await Promise.all([
    wantShifts
      ? db.shiftParticipant.findMany({
          where: {
            userId,
            ...(shiftIds ? { shiftId: { in: [...new Set(shiftIds)] } } : {}),
            shift: { endTime: { lt: completedBefore } },
          },
          select: {
            shiftId: true,
            rewardPaid: true,
            shift: { select: { reward: true, startTime: true, endTime: true, name: true } },
          },
        })
      : Promise.resolve([]),
    wantPal
      ? db.palPlusSessionTutor.findMany({
          where: {
            userId,
            ...(palSessionIds ? { sessionId: { in: [...new Set(palSessionIds)] } } : {}),
            // Een geannuleerde sessie levert niets op; wat er ooit van uitgegeven
            // werd, is bij het annuleren al verrekend (`settlePalPlusOverspend`).
            session: { endsAt: { lt: completedBefore }, cancelledAt: null },
          },
          select: {
            sessionId: true,
            reward: true,
            rewardPaid: true,
            session: {
              select: {
                startsAt: true,
                endsAt: true,
                cancelledAt: true,
                course: { select: { code: true, nameNl: true, nameEn: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    praesidiumYears([userId], db),
  ]);

  const sources: VoucherSource[] = [
    ...participations.map((participation) => ({
      key: `shift:${participation.shiftId}`,
      kind: "shift" as const,
      refId: participation.shiftId,
      reward: earnedShiftReward(
        { userId, reward: participation.shift.reward, startTime: participation.shift.startTime },
        praesidium,
      ),
      rewardPaid: participation.rewardPaid,
      endsAt: participation.shift.endTime,
      label: participation.shift.name,
    })),
    ...tutorRows.map((row) => ({
      key: `pal:${row.sessionId}`,
      kind: "pal" as const,
      refId: row.sessionId,
      reward: earnedPalPlusReward(
        { userId, reward: row.reward, startsAt: row.session.startsAt, cancelledAt: row.session.cancelledAt },
        praesidium,
      ),
      rewardPaid: row.rewardPaid,
      endsAt: row.session.endsAt,
      label: `PAL+: ${palPlusCourseLabel(row.session.course, "nl")}`,
    })),
  ];
  return sources.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
}

/** Het openstaande saldo van een reeks bronnen. */
export function outstandingVouchers(sources: VoucherSource[]): number {
  return sources.reduce((total, source) => total + outstandingShiftReward(source), 0);
}

/**
 * Boekt `amount` bonnetjes af van één gebruiker, oudste bron eerst, over zijn
 * shiften en de PAL+-sessies die hij gaf. Gebruikt door de afhaalbalie, de toog
 * en het uitbetalen in het beheer.
 *
 * Elke rij wordt voorwaardelijk bijgewerkt (op de oude `rewardPaid`): twee
 * afboekingen op hetzelfde moment botsen dan in plaats van samen meer uit te
 * geven dan er is.
 */
export async function allocateUserShiftReward(
  tx: Prisma.TransactionClient,
  {
    userId,
    amount,
    shiftIds,
    palSessionIds,
    completedBefore = new Date(),
  }: {
    userId: string;
    amount: number;
    shiftIds?: string[];
    palSessionIds?: string[];
    completedBefore?: Date;
  },
) {
  const sources = await loadVoucherSources(tx, { userId, completedBefore, shiftIds, palSessionIds });
  const byKey = new Map(sources.map((source) => [source.key, source]));
  const allocation = allocateVoucherBalances(sources, amount);

  for (const item of allocation.allocations) {
    const source = byKey.get(item.key);
    if (!source) throw new ShiftRewardConflictError();
    const previous = item.rewardPaid - item.amount;
    const updated =
      source.kind === "shift"
        ? await tx.shiftParticipant.updateMany({
            where: { shiftId: source.refId, userId, rewardPaid: previous },
            data: { rewardPaid: item.rewardPaid, payedOut: item.fullyPaid },
          })
        : await tx.palPlusSessionTutor.updateMany({
            where: { sessionId: source.refId, userId, rewardPaid: previous },
            data: { rewardPaid: item.rewardPaid },
          });
    if (updated.count !== 1) throw new ShiftRewardConflictError();
  }

  return allocation;
}

/**
 * Zet wat een tutor van één PAL+-sessie al uitgaf terug onder `ceiling` (de
 * nieuwe beloning, of nul bij een annulering). Het verschil komt uit zijn andere
 * openstaande bonnetjes; wat daar niet in past, vervalt. Een saldo gaat nooit
 * onder nul.
 *
 * Werk de beloning zelf eerst bij en roep dit daarna aan, in dezelfde
 * (serialiseerbare) transactie.
 */
export async function settlePalPlusOverspend(
  tx: Prisma.TransactionClient,
  { sessionId, userId, ceiling }: { sessionId: string; userId: string; ceiling: number },
): Promise<{ moved: number; forgiven: number }> {
  const row = await tx.palPlusSessionTutor.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { rewardPaid: true },
  });
  if (!row || row.rewardPaid <= ceiling) return { moved: 0, forgiven: 0 };

  const excess = row.rewardPaid - ceiling;
  const updated = await tx.palPlusSessionTutor.updateMany({
    where: { sessionId, userId, rewardPaid: row.rewardPaid },
    data: { rewardPaid: ceiling },
  });
  if (updated.count !== 1) throw new ShiftRewardConflictError();

  const available = outstandingVouchers(await loadVoucherSources(tx, { userId }));
  const result = settleOverspend(excess, available);
  if (result.moved > 0) await allocateUserShiftReward(tx, { userId, amount: result.moved });
  return result;
}

/**
 * De PAL+-beloningen van iedereen (of van `userIds`) in een periode, voor de
 * beheerlijsten die over alle gebruikers gaan: het scherm Bonnetjes en de
 * uitbetaling. `earned` volgt dezelfde regels als `loadVoucherSources`.
 */
export async function loadPalPlusRewardRows(
  db: Prisma.TransactionClient,
  { endedBefore, endedAfter, userIds }: { endedBefore: Date; endedAfter?: Date; userIds?: string[] },
) {
  const rows = await db.palPlusSessionTutor.findMany({
    where: {
      ...(userIds ? { userId: { in: userIds } } : {}),
      session: {
        cancelledAt: null,
        endsAt: { lt: endedBefore, ...(endedAfter ? { gte: endedAfter } : {}) },
      },
    },
    select: {
      userId: true,
      sessionId: true,
      reward: true,
      rewardPaid: true,
      user: { select: { name: true, email: true } },
      session: { select: { startsAt: true, endsAt: true, cancelledAt: true } },
    },
  });
  const praesidium = await praesidiumYears([...new Set(rows.map((row) => row.userId))], db);
  return rows.map((row) => ({
    userId: row.userId,
    sessionId: row.sessionId,
    name: row.user.name,
    email: row.user.email,
    reward: row.reward,
    earned: earnedPalPlusReward(
      { userId: row.userId, reward: row.reward, startsAt: row.session.startsAt, cancelledAt: row.session.cancelledAt },
      praesidium,
    ),
    rewardPaid: row.rewardPaid,
  }));
}
