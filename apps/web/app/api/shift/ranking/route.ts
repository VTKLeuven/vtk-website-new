import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/session';
import { prisma } from '@vtk/db';
import { authErrorResponse } from '@/lib/session';
import { shiftDeductions } from '@/lib/shift/deductions';

/**
 * Return het aantal (voltooide) shiften pp per post => client side in browser code gebruiken om totalen te someren
 *
 * "Voltooid" = de shift is voorbij (endTime in het verleden). Response is een
 * platte lijst van `{ userId, name, post, count }`; shiften zonder post krijgen
 * post `GEEN`. Afgenomen shiften (`lib/shift/deductions.ts`) gaan eraf bij hun
 * post, dus een `count` kan negatief zijn.
 */
export async function GET() {
  try {
    await requirePermission('shift.ranking');
  } catch (err) {
    return authErrorResponse(err);
  }

  const [participations, deductions] = await Promise.all([
    prisma.shiftParticipant.findMany({
      where: { shift: { endTime: { lt: new Date() } } },
      select: {
        userId: true,
        user: { select: { name: true } },
        shift: { select: { post: true } },
      },
    }),
    shiftDeductions(),
  ]);

  const ranking = new Map<string, { userId: string; name: string; post: string; count: number }>();

  for (const { userId, user, shift } of participations) {
    const post = shift.post ?? 'GEEN';
    const key = `${userId}::${post}`;
    const entry = ranking.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      ranking.set(key, { userId, name: user.name, post, count: 1 });
    }
  }

  for (const { userId, name, post: deductionPost, count } of deductions) {
    const post = deductionPost ?? 'GEEN';
    const key = `${userId}::${post}`;
    const entry = ranking.get(key);
    if (entry) {
      entry.count += count;
    } else {
      ranking.set(key, { userId, name, post, count });
    }
  }

  return NextResponse.json([...ranking.values()]);
}
