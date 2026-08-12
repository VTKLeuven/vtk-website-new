import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { requirePermission, authErrorResponse } from "@/lib/session";
import { outstandingShiftReward } from "@/lib/shift-rewards";
import {
  allocateUserShiftReward,
  ShiftRewardConflictError,
} from "@/lib/shift-rewards.server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";

/**
 * Geeft per gebruiker het aantal nog niet toegekende bonnetjes voor voltooide
 * shiften terug. Enkel beschikbaar voor beheerders met `shift.reward`.
 */
export async function GET() {
  try {
    await requirePermission("shift.reward");
  } catch (error) {
    return authErrorResponse(error);
  }

  const participations = await prisma.shiftParticipant.findMany({
    where: { shift: { endTime: { lt: new Date() } } },
    select: {
      userId: true,
      rewardPaid: true,
      user: { select: { name: true, email: true } },
      shift: { select: { reward: true } },
    },
  });

  const perUser = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      unpaidShifts: number;
      totalReward: number;
    }
  >();

  for (const { userId, rewardPaid, user, shift } of participations) {
    const outstanding = outstandingShiftReward({
      reward: shift.reward,
      rewardPaid,
    });
    if (outstanding === 0) continue;

    const entry = perUser.get(userId) ?? {
      userId,
      name: user.name,
      email: user.email,
      unpaidShifts: 0,
      totalReward: 0,
    };
    entry.unpaidShifts += 1;
    entry.totalReward += outstanding;
    perUser.set(userId, entry);
  }

  return NextResponse.json([...perUser.values()]);
}

/**
 * Kent een gekozen aantal bonnetjes toe aan één gebruiker.
 *
 * Body: `{ shiftIds: string[], userId: string, amount: number }`. De toekenning
 * wordt oudste shift eerst verdeeld en mag een shift gedeeltelijk uitbetalen.
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
  const { shiftIds, userId, amount } = src;

  if (
    !Array.isArray(shiftIds) ||
    shiftIds.length === 0 ||
    !shiftIds.every((shiftId) => typeof shiftId === "string")
  ) {
    return NextResponse.json(
      { error: "shiftIds must be a non-empty array of strings" },
      { status: 400 },
    );
  }
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json(
      { error: "userId must be a non-empty string" },
      { status: 400 },
    );
  }
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
        shiftIds: shiftIds as string[],
      }),
    );

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
