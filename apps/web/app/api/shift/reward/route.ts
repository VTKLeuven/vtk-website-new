import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { requirePermission, authErrorResponse } from "@/lib/session";
import { earnedShiftReward, outstandingShiftReward } from "@/lib/shift/rewards";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";
import {
  allocateUserShiftReward,
  loadPalPlusRewardRows,
  ShiftRewardConflictError,
} from "@/lib/shift/rewards.server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import { logAudit } from "@/lib/audit";

/**
 * Geeft per gebruiker het aantal nog niet toegekende bonnetjes voor voltooide
 * shiften en gegeven PAL+-sessies terug: één saldo. Enkel beschikbaar voor
 * beheerders met `shift.reward`.
 */
export async function GET() {
  try {
    await requirePermission("shift.reward");
  } catch (error) {
    return authErrorResponse(error);
  }

  const now = new Date();
  const [participations, praesidium, palRows] = await Promise.all([
    prisma.shiftParticipant.findMany({
      where: { shift: { endTime: { lt: new Date() } } },
      select: {
        userId: true,
        rewardPaid: true,
        user: { select: { name: true, email: true } },
        shift: { select: { reward: true, startTime: true } },
      },
    }),
    praesidiumYears(),
    loadPalPlusRewardRows(prisma, { endedBefore: now }),
  ]);

  const perUser = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      unpaidShifts: number;
      unpaidPalSessions: number;
      totalReward: number;
    }
  >();

  for (const { userId, rewardPaid, user, shift } of participations) {
    const outstanding = outstandingShiftReward({
      reward: earnedShiftReward({ userId, reward: shift.reward, startTime: shift.startTime }, praesidium),
      rewardPaid,
    });
    if (outstanding === 0) continue;

    const entry = perUser.get(userId) ?? {
      userId,
      name: user.name,
      email: user.email,
      unpaidShifts: 0,
      unpaidPalSessions: 0,
      totalReward: 0,
    };
    entry.unpaidShifts += 1;
    entry.totalReward += outstanding;
    perUser.set(userId, entry);
  }

  for (const row of palRows) {
    const outstanding = outstandingShiftReward({ reward: row.earned, rewardPaid: row.rewardPaid });
    if (outstanding === 0) continue;
    const entry = perUser.get(row.userId) ?? {
      userId: row.userId,
      name: row.name,
      email: row.email,
      unpaidShifts: 0,
      unpaidPalSessions: 0,
      totalReward: 0,
    };
    entry.unpaidPalSessions += 1;
    entry.totalReward += outstanding;
    perUser.set(row.userId, entry);
  }

  return NextResponse.json([...perUser.values()]);
}

/**
 * Kent een gekozen aantal bonnetjes toe aan één gebruiker.
 *
 * Body: `{ shiftIds: string[], palSessionIds?: string[], userId: string, amount: number }`.
 * De toekenning wordt oudste bron eerst verdeeld, over de gekozen shiften en
 * PAL+-sessies samen, en mag er één gedeeltelijk uitbetalen.
 */
export async function POST(request: Request) {
  try {
    await requirePermission("shift.reward");
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const src = (body ?? {}) as Record<string, unknown>;
  const { shiftIds, palSessionIds, userId, amount } = src;
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

  if (!isStringArray(shiftIds) || (palSessionIds !== undefined && !isStringArray(palSessionIds))) {
    return NextResponse.json(
      { error: "shiftIds and palSessionIds must be arrays of strings" },
      { status: 400 },
    );
  }
  if (shiftIds.length === 0 && (palSessionIds?.length ?? 0) === 0) {
    return NextResponse.json(
      { error: "pass at least one shiftId or palSessionId" },
      { status: 400 },
    );
  }
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json(
      { error: "userId must be a non-empty string" },
      { status: 400 },
    );
  }
  // Enkel hele bonnetjes: dit is wat fysiek meegegeven wordt, en een half
  // bonnetje bestaat niet op papier. Het saldo kan wel op een half eindigen
  // (een broodje aan de afhaalbalie kost per half); dat half blijft openstaan.
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const result = await withSerializableTransaction((tx) =>
      allocateUserShiftReward(tx, {
        userId,
        amount,
        shiftIds,
        palSessionIds: palSessionIds ?? [],
      }),
    );

    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    await logAudit({
      action: "grant",
      entity: "shiftReward",
      entityId: userId,
      target: recipient?.name ?? userId,
      summary: `${amount} bonnetje(s) toegekend over ${result.allocations.length} shift(en) of PAL+-sessie(s)`,
    });

    return NextResponse.json({
      awardedBonnetjes: amount,
      remainingBonnetjes: result.remaining,
      updatedParticipations: result.allocations.length,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ShiftRewardConflictError) {
      return NextResponse.json(
        { error: "Reward balance changed; refresh and try again" },
        { status: 409 },
      );
    }
    throw error;
  }
}
