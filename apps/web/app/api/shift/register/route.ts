import { NextResponse } from 'next/server';
import { requirePermission, requireSession } from '@/lib/session';
import { prisma } from '@vtk/db';
import { isRecordNotFound, isUniqueViolation } from '@/lib/shift';
import { authErrorResponse } from '@/lib/session';
import { CUDI_SHIFT_SOURCE } from '@/lib/cudiShiftMirror';
import { pushCudiRegistration } from '@/lib/cudiRegistrationSync';

/** Binnen dit venster voor de start kan een user zichzelf niet meer uitschrijven. */
const UNREGISTER_LOCK_MS = 24 * 60 * 60 * 1000;

/**
 * Bedenktijd na het inschrijven: wie per ongeluk op een shift klikt die morgen
 * al begint, kan dat nog rechtzetten in plaats van een admin te moeten zoeken.
 */
const UNREGISTER_GRACE_MS = 10 * 60 * 1000;

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
    include: { participants: { select: { userId: true, payedOut: true, registeredAt: true } } },
  });

  // `registeredAt` van deze user apart meegeven: de tabel bepaalt daarmee of de
  // bedenktijd nog loopt en of de uitschrijfknop dus actief mag zijn.
  return NextResponse.json(
    shifts.map((shift) => ({
      ...shift,
      registeredAt:
        shift.participants.find((participant) => participant.userId === targetUserId)
          ?.registeredAt ?? null,
    })),
  );
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

  // Cursusdienst-shiften wonen op cudi.vtk.be; de inschrijving moet daar ook
  // geregistreerd worden. Blokkerend: lukt dat niet, draai de native inschrijving
  // terug zodat main en cudi consistent blijven. Zonder integratie (geen secret)
  // geeft de push `skipped` terug en verandert er hier niets.
  if (shift.sourceSystem === CUDI_SHIFT_SOURCE && shift.sourceId) {
    const push = await pushCudiRegistration('register', shift.sourceId, session.user.id);
    if (!push.ok) {
      await prisma.shiftParticipant
        .delete({ where: { shiftId_userId: { shiftId: id, userId: session.user.id } } })
        .catch(() => {});
      if (push.status === 409) {
        return NextResponse.json({ error: 'Shift is full' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Could not sync with cursusdienst' }, { status: 502 });
    }
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

  const shift = await prisma.shift.findUnique({
    where: { id },
    select: { startTime: true, sourceSystem: true, sourceId: true },
  });
  if (!shift) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  const participant = await prisma.shiftParticipant.findUnique({
    where: { shiftId_userId: { shiftId: id, userId: session.user.id } },
    select: { registeredAt: true },
  });
  if (!participant) {
    return NextResponse.json({ error: 'You are not registered for this shift' }, { status: 404 });
  }

  // Binnen 24u voor de start kan een user zichzelf niet meer uitschrijven. Enkel
  // een admin kan dan nog verwijderen via het bewerk-endpoint (/api/shift PATCH).
  // Uitzondering: een misklik mag je meteen rechtzetten, dus vlak na het
  // inschrijven blijft uitschrijven mogelijk (zie UNREGISTER_GRACE_MS).
  const now = Date.now();
  const startsWithinLock = shift.startTime.getTime() - now < UNREGISTER_LOCK_MS;
  const withinGrace = now - participant.registeredAt.getTime() < UNREGISTER_GRACE_MS;
  if (startsWithinLock && !withinGrace) {
    return NextResponse.json(
      { error: 'Cannot unregister within 24 hours of the shift start' },
      { status: 409 },
    );
  }

  // Cursusdienst-shift: eerst op cudi uitschrijven, dan hier. Lukt cudi niet, dan
  // blijft de native inschrijving staan zodat main en cudi consistent blijven.
  // Zonder integratie (geen secret) geeft de push `skipped` terug en verandert er niets.
  if (shift.sourceSystem === CUDI_SHIFT_SOURCE && shift.sourceId) {
    const push = await pushCudiRegistration('unregister', shift.sourceId, session.user.id);
    if (!push.ok) {
      return NextResponse.json({ error: 'Could not sync with cursusdienst' }, { status: 502 });
    }
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
