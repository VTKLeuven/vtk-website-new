import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@vtk/db';
import { academicYearRange } from '@/lib/shift';
import { authErrorResponse } from '@/lib/session';
import { earnedShiftReward } from '@/lib/shift/rewards';
import { praesidiumYears } from '@/lib/shift/voucherEligibility';

/**
 * Get het totaal aantal shifts per post van de user die de request maakt, en het aantal onbetaalde shifts voor het huidige academiejaar
 *
 * Response: `{ perPost: { <post>: <aantal> }, total, unpaidCurrentYear }`.
 * Shiften zonder post worden onder de sleutel `GEEN` geteld.
 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  const userId = session.user.id;
  const [participations, praesidium] = await Promise.all([
    prisma.shiftParticipant.findMany({
      where: {
        userId,
        shift: { endTime: { lt: new Date() } },
      },
      select: {
        rewardPaid: true,
        shift: { select: { post: true, startTime: true, endTime: true, reward: true } },
      },
    }),
    praesidiumYears([userId]),
  ]);

  const { start, end } = academicYearRange();
  const perPost: Record<string, number> = {};
  let total = 0;
  let unpaidCurrentYear = 0;

  for (const { rewardPaid, shift } of participations) {
    const key = shift.post ?? 'GEEN';
    perPost[key] = (perPost[key] ?? 0) + 1;
    total += 1;

    // Een shift uit een praesidiumjaar telt mee, maar levert niets op.
    const earned = earnedShiftReward({ userId, reward: shift.reward, startTime: shift.startTime }, praesidium);
    if (rewardPaid < earned && shift.endTime >= start && shift.endTime < end) {
      unpaidCurrentYear += 1;
    }
  }

  return NextResponse.json({ perPost, total, unpaidCurrentYear });
}
