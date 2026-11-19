import { NextResponse } from 'next/server';
import { requirePermission, requireSession } from '@/lib/session';
import { prisma } from '@vtk/db';
import { isRecordNotFound, isUniqueViolation } from '@/lib/shift';
import { authErrorResponse } from '@/lib/session';
import { CUDI_SHIFT_SOURCE } from '@/lib/cudiShiftMirror';
import { pushCudiRegistration } from '@/lib/cudiRegistrationSync';
import { handledLeadFields } from '@/lib/shift/reminders';
import { withSerializableTransaction } from '@/lib/ticketing/transactions';
import { registeredShifts } from '@/lib/shift/lists';
import { praesidiumYears } from '@/lib/shift/voucherEligibility';
import { canBeReplaceable, canReplace, pickReplaced, shiftReplacedMail } from '@/lib/shift/replace';
import { sendMail } from '@/lib/email';
import { preferredEmail } from '@/lib/brevo/contacts';

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

  return NextResponse.json(await registeredShifts(targetUserId, session.user.id));
}

/**
 * Registreer een user voor een bepaalde shift
 *
 * Requests zijn van de vorm /api/shift/register?id=*****[&replaceable=1]
 *
 * `replaceable=1` (enkel voor een praesidiumlid): een student mag deze plaats
 * later innemen. Staat de shift vol en schrijft een student zich in, dan neemt
 * die de plaats in van het laatst ingeschreven vervangbare praesidiumlid, dat
 * daarna een mail krijgt. Zie `lib/shift/replace.ts`.
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }
  const wantsReplaceable = params.get('replaceable') === '1';

  let registration;
  try {
    registration = await withSerializableTransaction(async (tx) => {
      const shift = await tx.shift.findUnique({
        where: { id },
        include: {
          participants: { select: { userId: true, replaceable: true, registeredAt: true } },
        },
      });
      if (!shift) return { status: 'NOT_FOUND' as const };
      if (shift.startTime <= new Date()) return { status: 'STARTED' as const };
      const praesidium = await praesidiumYears([session.user.id], tx);
      // Vol, maar er staat een praesidiumlid op dat vervangen mag worden: een
      // student neemt die plaats in. Een ander praesidiumlid niet.
      const replaced =
        shift.participants.length >= shift.maxParticipants &&
        canReplace(session.user.id, shift, praesidium)
          ? pickReplaced(shift.participants)
          : null;
      if (shift.participants.length >= shift.maxParticipants && !replaced) {
        return { status: 'FULL' as const };
      }

      // Half-open interval: aansluitende shiften (einde == start) botsen niet.
      const overlap = await tx.shift.findFirst({
        where: {
          id: { not: id },
          participants: { some: { userId: session.user.id } },
          startTime: { lt: shift.endTime },
          endTime: { gt: shift.startTime },
        },
        select: { id: true, name: true },
      });
      if (overlap) return { status: 'OVERLAP' as const, overlap };

      if (replaced) {
        await tx.shiftParticipant.delete({
          where: { shiftId_userId: { shiftId: id, userId: replaced.userId } },
        });
      }
      await tx.shiftParticipant.create({
        data: {
          shiftId: id,
          userId: session.user.id,
          payedOut: false,
          // Stil genegeerd voor wie geen praesidium is: de knop staat er voor
          // hem niet, dus dit komt enkel van een oude of nagemaakte aanvraag.
          replaceable: wantsReplaceable && canBeReplaceable(session.user.id, shift, praesidium),
          // Wie zich vlak voor de start inschrijft, krijgt geen mail meer die
          // begint met "morgen sta je ingepland": die vensters zijn al voorbij
          // en worden meteen als afgehandeld gemarkeerd.
          ...handledLeadFields(shift.startTime, new Date()),
        },
      });
      return {
        status: 'OK' as const,
        sourceSystem: shift.sourceSystem,
        sourceId: shift.sourceId,
        replacedUserId: replaced?.userId ?? null,
        shift: {
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          location: shift.location,
        },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'Already registered for this shift' }, { status: 409 });
    }
    throw err;
  }

  if (registration.status === 'NOT_FOUND') {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }
  if (registration.status === 'STARTED') {
    return NextResponse.json({ error: 'Registration has closed for this shift' }, { status: 409 });
  }
  if (registration.status === 'FULL') {
    return NextResponse.json({ error: 'Shift is full' }, { status: 409 });
  }
  if (registration.status === 'OVERLAP') {
    return NextResponse.json(
      {
        error: 'You are already registered for an overlapping shift',
        conflictShift: { id: registration.overlap.id, name: registration.overlap.name },
      },
      { status: 409 },
    );
  }

  // Cursusdienst-shiften wonen op cudi.vtk.be; de inschrijving moet daar ook
  // geregistreerd worden. Blokkerend: lukt dat niet, draai de native inschrijving
  // terug zodat main en cudi consistent blijven. Zonder integratie (geen secret)
  // geeft de push `skipped` terug en verandert er hier niets.
  if (registration.sourceSystem === CUDI_SHIFT_SOURCE && registration.sourceId) {
    const push = await pushCudiRegistration('register', registration.sourceId, session.user.id);
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

  if (registration.replacedUserId) {
    await mailReplacedParticipant(registration.replacedUserId, registration.shift);
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

/**
 * Laat het vervangen praesidiumlid weten dat het niet meer moet komen. De
 * inschrijving is dan al omgewisseld: een mail die niet vertrekt, mag die niet
 * terugdraaien, dus een fout hier wordt gelogd en niet gegooid.
 */
async function mailReplacedParticipant(
  userId: string,
  shift: { name: string; startTime: Date; endTime: Date; location: string },
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, locale: true, email: true, personalEmail: true, emailPreference: true },
    });
    if (!user) return;
    const mail = shiftReplacedMail({ name: user.name, locale: user.locale }, shift);
    await sendMail(
      {
        to: preferredEmail(user),
        from: 'VTK Shiften <shiften@vtk.be>',
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      },
      { source: 'shifts' },
    );
  } catch (error) {
    console.error('Could not mail a replaced shift participant', { userId, error });
  }
}

/**
 * Zet "een student mag mijn plaats innemen" aan of uit op de eigen inschrijving.
 *
 * Requests zijn van de vorm /api/shift/register?id=***** met als body
 * `{ "replaceable": true | false }`. Enkel voor een praesidiumlid, en enkel zolang
 * de shift niet begonnen is.
 */
export async function PATCH(request: Request) {
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
  const body = (await request.json().catch(() => null)) as { replaceable?: unknown } | null;
  if (typeof body?.replaceable !== 'boolean') {
    return NextResponse.json({ error: 'replaceable must be a boolean' }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({
    where: { id },
    select: { startTime: true, sourceSystem: true },
  });
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  if (shift.startTime <= new Date()) {
    return NextResponse.json({ error: 'Registration has closed for this shift' }, { status: 409 });
  }
  const praesidium = await praesidiumYears([session.user.id]);
  if (body.replaceable && !canBeReplaceable(session.user.id, shift, praesidium)) {
    return NextResponse.json({ error: 'Only praesidium can be replaced' }, { status: 403 });
  }

  const { count } = await prisma.shiftParticipant.updateMany({
    where: { shiftId: id, userId: session.user.id },
    data: { replaceable: body.replaceable },
  });
  if (count === 0) {
    return NextResponse.json({ error: 'You are not registered for this shift' }, { status: 404 });
  }
  return NextResponse.json({ success: true, replaceable: body.replaceable });
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
