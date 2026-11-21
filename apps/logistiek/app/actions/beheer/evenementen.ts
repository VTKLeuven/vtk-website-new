'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import { transportEventChanges } from '@/lib/uitleen';
import { parseBrusselsDateTime } from '@/lib/reservation-form';
import { runSerializable } from '@/lib/tx';
import type { ActionResult } from '@/app/actions/uitleen';
import { revalidateBeheer } from './shared';

// ---------------------------------------------------------------------------
// Evenementen (A8)
// ---------------------------------------------------------------------------

function revalidateEvents() {
  revalidatePath('/beheer/evenementen');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
  revalidatePath('/flesserke');
}

export async function saveEventAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const id = String(formData.get('eventId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  // Dag en uur staan apart (E2): bij het aanmaken is het uur vaak nog niet
  // gekend, en één datetime-veld dwingt je er dan een te verzinnen.
  const startDateRaw = String(formData.get('startDate') ?? '').trim();
  const startTimeRaw = String(formData.get('startTime') ?? '').trim();
  const endDateRaw = String(formData.get('endDate') ?? '').trim();
  const endTimeRaw = String(formData.get('endTime') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!name) return saveError('NAME_REQUIRED');

  const startAt = startDateRaw
    ? parseBrusselsDateTime(`${startDateRaw}T${startTimeRaw || '00:00'}`)
    : null;
  if (startDateRaw && !startAt) return saveError('START_INVALID');

  const endAt = endDateRaw
    ? parseBrusselsDateTime(`${endDateRaw}T${endTimeRaw || '23:59'}`)
    : null;
  if (endDateRaw && !endAt) return saveError('END_INVALID');
  // Een evenement dat eindigt voor het begint, is een tikfout; het materiaal
  // zou er anders "negatief lang" moeten staan.
  if (startAt && endAt && endAt < startAt) return saveError('END_BEFORE_START');

  const data = {
    name: name.slice(0, 200),
    location: location.slice(0, 300) || null,
    startAt,
    startTimeKnown: Boolean(startDateRaw && startTimeRaw),
    endAt,
    note: note.slice(0, 1000) || null,
  };

  if (id) await prisma.uitleenEvent.update({ where: { id }, data });
  else await prisma.uitleenEvent.create({ data: { ...data, createdById: session.user.id } });

  revalidateBeheer();
  revalidateEvents();
  return saveOk();
}

/**
 * Een aanvraag onder een evenement hangen, of ervan losmaken (`eventId` leeg).
 *
 * Werkt op materiaal-, flesserke- en vervoeraanvragen; bij een heen-en-terugrit
 * of meerdere voertuigen gaat de hele groep mee, want die horen sowieso bij
 * elkaar.
 *
 * Bij een rit gaat de naam mee (`eventName`), en dat is het halve werk: tot
 * september 2026 zette deze actie enkel `eventId`. Na "Loskoppelen" stond de
 * naam dan nog in de lijst, in de planning en in de agendafeed, en leek de knop
 * niets te doen. Loskoppelen wist de naam dus altijd, ook wanneer het een naam
 * is die de aanvrager zelf intikte zonder te koppelen: dat is de "Wissen" bij
 * zo'n losse naam. De oude waarde staat in de historiek. Zie
 * docs/design-decisions.md.
 */
export async function linkToEventAction(
  target: { kind: 'reservation' | 'transport'; id: string },
  eventId: string | null
): Promise<ActionResult> {
  const session = await requireManage();

  let event: { id: string; name: string } | null = null;
  if (eventId) {
    event = await prisma.uitleenEvent.findUnique({
      where: { id: eventId },
      select: { id: true, name: true },
    });
    if (!event) return { ok: false, error: 'Evenement niet gevonden.' };
  }

  if (target.kind === 'reservation') {
    const updated = await prisma.uitleenReservation.updateMany({
      where: { id: target.id },
      data: { eventId },
    });
    if (updated.count === 0) return { ok: false, error: 'Aanvraag niet gevonden.' };
    revalidateBeheer();
    revalidateEvents();
    return { ok: true, message: eventId ? 'Aan het evenement gekoppeld.' : 'Losgekoppeld.' };
  }

  const outcome = await setTransportEvent(target.id, event, session.user.id);
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'Rit niet gevonden.' };
  if (outcome === 'NO_CHANGES') return { ok: true, message: 'Niets gewijzigd.' };

  revalidateBeheer();
  revalidateEvents();
  return {
    ok: true,
    message: event
      ? 'Aan het evenement gekoppeld.'
      : outcome === 'CLEARED_NAME'
        ? 'Naam gewist.'
        : 'Losgekoppeld.',
  };
}

/**
 * Het evenement van een rit zetten of weghalen, voor beide helften samen.
 *
 * De enige plek die `eventId` en `eventName` van een bestaande rit schrijft,
 * zodat ze niet opnieuw uit elkaar lopen. Eén historiekregel per helft: wie de
 * terugrit opent, moet ook zien dat ze van evenement veranderde.
 */
async function setTransportEvent(
  bookingId: string,
  event: { id: string; name: string } | null,
  actorId: string
): Promise<'NOT_FOUND' | 'NO_CHANGES' | 'LINKED' | 'UNLINKED' | 'CLEARED_NAME'> {
  return runSerializable(async (tx) => {
    const booking = await tx.uitleenTransportBooking.findUnique({
      where: { id: bookingId },
      select: { tripGroupId: true },
    });
    if (!booking) return 'NOT_FOUND' as const;
    const legs = await tx.uitleenTransportBooking.findMany({
      where: booking.tripGroupId ? { tripGroupId: booking.tripGroupId } : { id: bookingId },
      select: { id: true, eventId: true, eventName: true },
    });
    const changes = transportEventChanges(legs, event);
    if (changes.length === 0) return 'NO_CHANGES' as const;

    for (const change of changes) {
      await tx.uitleenTransportBooking.update({
        where: { id: change.id },
        data: { eventId: event?.id ?? null, eventName: event ? event.name.slice(0, 300) : null },
      });
      await writeAudit(tx, { transportBookingId: change.id }, {
        kind: 'EDITED',
        note: change.note,
        actorId,
      });
    }
    if (event) return 'LINKED' as const;
    return changes.some((change) => change.hadLink) ? ('UNLINKED' as const) : ('CLEARED_NAME' as const);
  });
}

/**
 * Het evenement verwijderen, niet wat eronder hangt.
 *
 * De aanvragen zijn het echte werk; de koepel is een groepering. `onDelete:
 * SetNull` laat ze staan, en dat is ook wat de bevestigingstekst belooft.
 */
export async function deleteEventAction(eventId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenEvent.delete({ where: { id: eventId } });
  revalidateBeheer();
  revalidateEvents();
  return { ok: true, message: 'Evenement verwijderd; de aanvragen blijven bestaan.' };
}
