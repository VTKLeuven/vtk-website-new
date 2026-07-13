import { NextResponse } from 'next/server';
import { requirePermission, requireSession } from '@/lib/session';
import { prisma } from '@vtk/db';
import { parseShift, parsePartialShift, isRecordNotFound, ShiftValidationError } from '@/lib/shift';
import { authErrorResponse } from '@/lib/session';

/**
 * Get de huidige shiften (waar een user zich voor kan registreren)
 *
 * Alle shiften worden doorgestuurd, ook als shift al volzet is, of een user geregistreerd is.
 * Enkel shiften waar de user al voor geregistreerd is worden weggelaten.
 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  const now = new Date();
  const shifts = await prisma.shift.findMany({
    where: { endTime: { gte: now } },
    orderBy: { startTime: 'asc' },
    include: { participants: { select: { userId: true } } },
  });

  const available = shifts
    .map(({ participants, ...shift }) => {
      const takenSpots = participants.length;
      return {
        ...shift,
        takenSpots,
        availableSpots: Math.max(0, shift.maxParticipants - takenSpots),
        isRegistered: participants.some((p) => p.userId === session.user.id),
      };
    })
    .filter((shift) => !shift.isRegistered);

  return NextResponse.json(available);
}

/**
 * Voeg een nieuwe shift toe (enkel als juiste rechten)
 *
 * Requests zijn van de vorm /api/shift
 */
export async function POST(request: Request) {
  try {
    await requirePermission('shift.edit');
  } catch (err) {
    return authErrorResponse(err);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let data;
  try {
    data = parseShift(body);
  } catch (err) {
    if (err instanceof ShiftValidationError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.details },
        { status: 400 }
      );
    }
    throw err;
  }

  const shift = await prisma.shift.create({ data });

  return NextResponse.json(shift, { status: 201 });
}

/**
 * Verwijder een shift (enkel als juiste rechten)
 *
 * Requests zijn van de vorm /api/shift?id=*****
 */
export async function DELETE(request: Request) {
  try {
    await requirePermission('shift.edit');
  } catch (err) {
    return authErrorResponse(err);
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  try {
    await prisma.shift.delete({ where: { id } });
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ success: true });
}

/**
 * Edit een shift (enkel als juiste rechten)
 *
 * Requests zijn van de vorm /api/shift?id=*****
 * => In de request body voeg je de (aangepaste) velden toe met hun (nieuwe) waardes
 */
export async function PATCH(request: Request) {
  try {
    await requirePermission('shift.edit');
  } catch (err) {
    return authErrorResponse(err);
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let patch;
  try {
    patch = parsePartialShift(body);
  } catch (err) {
    if (err instanceof ShiftValidationError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.details },
        { status: 400 }
      );
    }
    throw err;
  }

  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  // parsePartialShift kan enkel start vs end vergelijken wanneer beide meegegeven
  // zijn; valideer de uiteindelijke combinatie tegen de bestaande waardes.
  const start = patch.startTime ?? existing.startTime;
  const end = patch.endTime ?? existing.endTime;
  if (end <= start) {
    return NextResponse.json(
      { error: 'Validation failed', details: ['endTime must be after startTime'] },
      { status: 400 }
    );
  }

  const shift = await prisma.shift.update({ where: { id }, data: patch });

  return NextResponse.json(shift);
}
