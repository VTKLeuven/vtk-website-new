import { NextResponse } from 'next/server';
import { requirePermission, requireSession } from '@/lib/session';
import { prisma } from '@vtk/db';
import { isRecordNotFound, isUniqueViolation } from '@/lib/shift';
import { authErrorResponse } from '@/lib/session';

/**
 * Return alle huidige of toekomstige shifts waarvoor de user geregistreerd is
 *
 * /api/shift/register => return shiften van huidige user
 * /api/shift/register?userId=*** => return shiften van een willekeurige user (als de juiste permissions)
 *
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  let targetUserId = session.user.id;
  const requestedUserId = new URL(request.url).searchParams.get('userId');

  // Andermans shiften bekijken vereist de juiste rechten; de eigen shiften niet.
  if (requestedUserId && requestedUserId !== session.user.id) {
    try {
      await requirePermission('shift.ranking');
    } catch (err) {
      return authErrorResponse(err);
    }
    targetUserId = requestedUserId;
  }

  const now = new Date();
  const shifts = await prisma.shift.findMany({
    where: {
      endTime: { gte: now },
      participants: { some: { userId: targetUserId } },
    },
    orderBy: { startTime: 'asc' },
    include: { participants: { select: { userId: true, payedOut: true } } },
  });

  return NextResponse.json(shifts);
}

/**
 * Registreer een user voor een bepaalde shift
 *
 * Requests zijn van de vorm /api/shift/register?id=*****
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: { _count: { select: { participants: true } } },
  });
  if (!shift) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }
  if (shift._count.participants >= shift.maxParticipants) {
    return NextResponse.json({ error: 'Shift is full' }, { status: 409 });
  }

  // Weiger als de user al ingeschreven is voor een (zelfs deels) overlappende
  // shift. Half-open interval: aansluitende shiften (einde == start) botsen niet.
  const overlap = await prisma.shift.findFirst({
    where: {
      id: { not: id },
      participants: { some: { userId: session.user.id } },
      startTime: { lt: shift.endTime },
      endTime: { gt: shift.startTime },
    },
    select: { id: true, name: true },
  });
  if (overlap) {
    return NextResponse.json(
      {
        error: 'You are already registered for an overlapping shift',
        conflictShift: { id: overlap.id, name: overlap.name },
      },
      { status: 409 },
    );
  }

  try {
    await prisma.shiftParticipant.create({
      data: { shiftId: id, userId: session.user.id, payedOut: false },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'Already registered for this shift' }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

/**
 * Onregistreer een user van een bepaalde shift
 *
 * (Enkel voor de user zelf, om iemand te "verwijderen" van een shift, gebruik /shift/edit om een user te verijwderen)
 *
 * Requests zijn van de vorm /api/shift/register?id=*****
 */
export async function DELETE(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({ where: { id }, select: { startTime: true } });
  if (!shift) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  // Binnen 24u voor de start kan een user zichzelf niet meer uitschrijven. Enkel
  // een admin kan dan nog verwijderen via het bewerk-endpoint (/api/shift PATCH).
  const UNREGISTER_LOCK_MS = 24 * 60 * 60 * 1000;
  if (shift.startTime.getTime() - Date.now() < UNREGISTER_LOCK_MS) {
    return NextResponse.json(
      { error: 'Cannot unregister within 24 hours of the shift start' },
      { status: 409 },
    );
  }

  try {
    await prisma.shiftParticipant.delete({
      where: { shiftId_userId: { shiftId: id, userId: session.user.id } },
    });
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: 'You are not registered for this shift' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ success: true });
}
