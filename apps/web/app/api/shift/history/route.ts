import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@vtk/db';
import { academicYearRange } from '@/lib/shift';
import { authErrorResponse } from '@/lib/session';

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

  const participations = await prisma.shiftParticipant.findMany({
    where: { userId: session.user.id },
    select: { payedOut: true, shift: { select: { post: true, endTime: true } } },
  });

  const { start, end } = academicYearRange();
  const perPost: Record<string, number> = {};
  let total = 0;
  let unpaidCurrentYear = 0;

  for (const { payedOut, shift } of participations) {
    const key = shift.post ?? 'GEEN';
    perPost[key] = (perPost[key] ?? 0) + 1;
    total += 1;

    if (!payedOut && shift.endTime >= start && shift.endTime < end) {
      unpaidCurrentYear += 1;
    }
  }

  return NextResponse.json({ perPost, total, unpaidCurrentYear });
}
