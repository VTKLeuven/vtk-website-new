import "server-only";

import type { Prisma } from "@prisma/client";
import { allocateShiftReward, earnedShiftReward } from "@/lib/shift/rewards";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";

export class ShiftRewardConflictError extends Error {
  constructor() {
    super("SHIFT_REWARD_CHANGED");
  }
}

export async function allocateUserShiftReward(
  tx: Prisma.TransactionClient,
  {
    userId,
    amount,
    shiftIds,
    completedBefore = new Date(),
  }: {
    userId: string;
    amount: number;
    shiftIds?: string[];
    completedBefore?: Date;
  },
) {
  const [participations, praesidium] = await Promise.all([
    tx.shiftParticipant.findMany({
      where: {
        userId,
        ...(shiftIds ? { shiftId: { in: [...new Set(shiftIds)] } } : {}),
        shift: { endTime: { lt: completedBefore } },
      },
      select: {
        shiftId: true,
        rewardPaid: true,
        shift: { select: { reward: true, startTime: true } },
      },
      orderBy: { shift: { endTime: "asc" } },
    }),
    praesidiumYears([userId], tx),
  ]);

  // Een shift uit een praesidiumjaar levert niets op, dus er valt ook niets van
  // af te boeken (`earnedShiftReward`).
  const allocation = allocateShiftReward(
    participations.map((participation) => ({
      shiftId: participation.shiftId,
      reward: earnedShiftReward(
        { userId, reward: participation.shift.reward, startTime: participation.shift.startTime },
        praesidium,
      ),
      rewardPaid: participation.rewardPaid,
    })),
    amount,
  );

  for (const item of allocation.allocations) {
    const updated = await tx.shiftParticipant.updateMany({
      where: {
        shiftId: item.shiftId,
        userId,
        rewardPaid: item.rewardPaid - item.amount,
      },
      data: {
        rewardPaid: item.rewardPaid,
        payedOut: item.fullyPaid,
      },
    });
    if (updated.count !== 1) throw new ShiftRewardConflictError();
  }

  return allocation;
}
