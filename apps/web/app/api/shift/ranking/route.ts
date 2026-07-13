import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/session';
import { prisma } from '@vtk/db';
import { authErrorResponse } from '@/lib/session';

/**
 * Return het aantal (voltooide) shiften pp per post => client side in browser code gebruiken om totalen te someren
 *
 * "Voltooid" = de shift is voorbij (endTime in het verleden). Response is een
 * platte lijst van `{ userId, name, post, count }`; shiften zonder post krijgen
 * post `GEEN`.
 */
export async function GET() {
  try {
    await requirePermission('shift.ranking');
  } catch (err) {
    return authErrorResponse(err);
  }

  const participations = await prisma.shiftParticipant.findMany({
    where: { shift: { endTime: { lt: new Date() } } },
    select: {
      userId: true,
      user: { select: { name: true } },
      shift: { select: { post: true } },
    },
  });

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

  return NextResponse.json([...ranking.values()]);
}
