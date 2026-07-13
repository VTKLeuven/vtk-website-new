import { NextResponse } from 'next/server';
import { requirePermission, requireSession } from '@/lib/session';
import { prisma } from '@vtk/db';
import {
  parseShift,
  parsePartialShift,
  isRecordNotFound,
  isForeignKeyViolation,
  ShiftValidationError,
} from '@/lib/shift';
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

/** De door de gebruiker aanpasbare shift-velden (los van deelnemer-operaties). */
const SHIFT_FIELD_KEYS = [
  'name',
  'startTime',
  'endTime',
  'location',
  'description',
  'maxParticipants',
  'reward',
  'post',
];

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');

/**
 * Edit een shift (enkel als juiste rechten)
 *
 * Requests zijn van de vorm /api/shift?id=*****
 * => In de request body voeg je de (aangepaste) velden toe met hun (nieuwe) waardes.
 *    Daarnaast kunnen admins deelnemers toevoegen/verwijderen via `addParticipants`
 *    en `removeParticipants` (arrays van userId's). Dit is de admin-override: er
 *    worden bewust géén overlap-/vol-/verleden-regels gecontroleerd.
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

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'body must be an object' }, { status: 400 });
  }
  const src = body as Record<string, unknown>;

  if (src.addParticipants !== undefined && !isStringArray(src.addParticipants)) {
    return NextResponse.json(
      { error: 'addParticipants must be an array of user ids' },
      { status: 400 }
    );
  }
  if (src.removeParticipants !== undefined && !isStringArray(src.removeParticipants)) {
    return NextResponse.json(
      { error: 'removeParticipants must be an array of user ids' },
      { status: 400 }
    );
  }
  const toAdd = (src.addParticipants as string[] | undefined) ?? [];
  const toRemove = (src.removeParticipants as string[] | undefined) ?? [];

  // Veldwijzigingen enkel parsen wanneer er effectief shift-velden meegegeven zijn,
  // zodat een deelnemer-only edit niet faalt op "no valid fields to update".
  const hasFieldChanges = SHIFT_FIELD_KEYS.some((k) => k in src);
  let patch: ReturnType<typeof parsePartialShift> = {};
  if (hasFieldChanges) {
    try {
      patch = parsePartialShift(src);
    } catch (err) {
      if (err instanceof ShiftValidationError) {
        return NextResponse.json(
          { error: 'Validation failed', details: err.details },
          { status: 400 }
        );
      }
      throw err;
    }
  }

  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  if (hasFieldChanges) {
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
  }

  // Controleer vooraf dat alle toe te voegen users bestaan, zodat we een nette
  // 400 geven i.p.v. een foreign-key-crash in de transactie (bvb bij een user
  // die tussen zoeken en opslaan verwijderd werd).
  if (toAdd.length) {
    const uniqueAdd = [...new Set(toAdd)];
    const found = await prisma.user.findMany({
      where: { id: { in: uniqueAdd } },
      select: { id: true },
    });
    if (found.length !== uniqueAdd.length) {
      return NextResponse.json(
        { error: 'One or more users to add do not exist' },
        { status: 400 }
      );
    }
  }

  try {
    await prisma.$transaction([
      ...(hasFieldChanges ? [prisma.shift.update({ where: { id }, data: patch })] : []),
      ...(toRemove.length
        ? [prisma.shiftParticipant.deleteMany({ where: { shiftId: id, userId: { in: toRemove } } })]
        : []),
      ...(toAdd.length
        ? [
            prisma.shiftParticipant.createMany({
              data: toAdd.map((userId) => ({ shiftId: id, userId, payedOut: false })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  } catch (err) {
    // Shift (of user) tussentijds verwijderd → nette 404/409 i.p.v. 500.
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'Shift or user no longer exists' }, { status: 409 });
    }
    throw err;
  }

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      participants: {
        select: { userId: true, payedOut: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  return NextResponse.json(shift);
}
