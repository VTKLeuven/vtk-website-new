import "server-only";

import type { Prisma } from "@prisma/client";
import { allocateShiftReward } from "@/lib/shift-rewards";

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
  const participations = await tx.shiftParticipant.findMany({
    where: {
      userId,
      ...(shiftIds ? { shiftId: { in: [...new Set(shiftIds)] } } : {}),
      shift: { endTime: { lt: completedBefore } },
    },
    select: {
      shiftId: true,
      rewardPaid: true,
      shift: { select: { reward: true } },
    },
    orderBy: { shift: { endTime: "asc" } },
  });

  const allocation = allocateShiftReward(
    participations.map((participation) => ({
      shiftId: participation.shiftId,
      reward: participation.shift.reward,
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
