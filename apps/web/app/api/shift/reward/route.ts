import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/session';
import { prisma } from '@vtk/db';
import { authErrorResponse } from '@/lib/session';

/**
 * Get number of rewards not yet claimed per user
 *
 * Only for users with correct permissions. Enkel voltooide shiften (endTime in
 * het verleden) tellen mee. Response is een lijst van
 * `{ userId, name, email, unpaidShifts, totalReward }`.
 */
export async function GET() {
  try {
    await requirePermission('shift.reward');
  } catch (err) {
    return authErrorResponse(err);
  }

  const participations = await prisma.shiftParticipant.findMany({
    where: { payedOut: false, shift: { endTime: { lt: new Date() } } },
    select: {
      userId: true,
      user: { select: { name: true, email: true } },
      shift: { select: { reward: true } },
    },
  });

  const perUser = new Map<
    string,
    { userId: string; name: string; email: string; unpaidShifts: number; totalReward: number }
  >();

  for (const { userId, user, shift } of participations) {
    const entry = perUser.get(userId) ?? {
      userId,
      name: user.name,
      email: user.email,
      unpaidShifts: 0,
      totalReward: 0,
    };
    entry.unpaidShifts += 1;
    entry.totalReward += shift.reward;
    perUser.set(userId, entry);
  }

  return NextResponse.json([...perUser.values()]);
}

/**
 * Claim the rewards for a certain (number of) shift(s)
 *
 * Only for users with correct permissions.
 *
 * Body: `{ shiftIds: string[], userId?: string }`. Zonder `userId` worden de
 * openstaande rewards van álle deelnemers van die shiften uitbetaald; met
 * `userId` enkel die van de betreffende gebruiker.
 */
export async function POST(request: Request) {
  try {
    await requirePermission('shift.reward');
  } catch (err) {
    return authErrorResponse(err);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const src = (body ?? {}) as Record<string, unknown>;
  const { shiftIds, userId } = src;

  if (
    !Array.isArray(shiftIds) ||
    shiftIds.length === 0 ||
    !shiftIds.every((s) => typeof s === 'string')
  ) {
    return NextResponse.json(
      { error: 'shiftIds must be a non-empty array of strings' },
      { status: 400 }
    );
  }

  if (userId !== undefined && typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId must be a string' }, { status: 400 });
  }

  const result = await prisma.shiftParticipant.updateMany({
    where: {
      shiftId: { in: shiftIds as string[] },
      payedOut: false,
      ...(userId !== undefined ? { userId: userId as string } : {}),
    },
    data: { payedOut: true },
  });

  return NextResponse.json({ paidOut: result.count });
}
