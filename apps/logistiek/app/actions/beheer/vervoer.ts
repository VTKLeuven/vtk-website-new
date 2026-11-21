'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import type { Prisma, UitleenRequesterType } from '@prisma/client';
import { requireManage } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import {
  chargesRequester,
  formatBrusselsTime,
  formatDateTime,
  handoverNote,
  isOnQuarterHour,
  mergeHandover,
  momentsOverlap,
  REQUESTER_TYPE_LABELS,
  toBrusselsDateValue,
  transportPriceCents,
  tripTitle,
  type TripHandoverOutcome,
} from '@/lib/uitleen';
import { notifyGroupAssignedForTrip, notifyTransport } from '@/lib/uitleen-mail';
import { driverAvailability, isDriver } from '@/lib/uitleen-server';
import { parseBrusselsDateTime } from '@/lib/reservation-form';
import {
  buildTransportBookings,
  buildTransportSeries,
  type TransportFormInput,
} from '@/lib/transport-form';
import {
  MAX_SERIES_OCCURRENCES,
  seriesOccurrences,
  type RecurrenceEnd,
  type RecurrenceRule,
} from '@/lib/recurrence';
import { runSerializable } from '@/lib/tx';
import { windowMoved } from '@/lib/transport-conflicts';
import type { ActionResult } from '@/app/actions/uitleen';
import { BLOCKING_PAYMENT_STATUSES, revalidateBeheer } from './shared';

// ---------------------------------------------------------------------------
// Vervoer (kar / auto / bakfiets)
// ---------------------------------------------------------------------------

/**
 * De rit aanmaken die de levering van een materiaalaanvraag is.
 *
 * "Levering nodig" was tot nu toe enkel een vinkje op de aanvraag. Het maakte
 * geen rit aan, stond niet in de aanvragenlijst en niet in de mail, en kwam dus
 * nooit in het vervoerbeheer terecht: wie die ene regel op de detailpagina niet
 * opmerkte, wist van niets. Nu zet Logistiek ze hier door.
 *
 * Drie keuzes die niet vanzelf spreken:
 *
 * - **De rit komt op naam van de aanvrager**, niet van wie ze aanmaakt. Zo ziet
 *   het lid ze bij "Mijn aanvragen" staan en gaan de mails erover naar hem, net
 *   als bij een rit die hij zelf aanvroeg.
 * - **Ze wordt AANGEVRAAGD en niet meteen goedgekeurd.** De goedkeuring doet de
 *   botsingscontrole per voertuig, kiest de betaalwijze en wijst de chauffeur
 *   toe; die overslaan zou een tweede, zwakkere beslisweg maken. Het is dus één
 *   klik extra, in ruil voor dezelfde controle als elke andere rit.
 * - **Het evenement volgt de aanvraag.** Hangt de aanvraag onder een koepel (A8),
 *   dan hangt de rit daar ook onder, zodat beide op de evenementpagina staan.
 */
export async function createTransportForReservationAction(
  reservationId: string,
  input: TransportFormInput
): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      userId: true,
      eventId: true,
      requesterType: true,
      groupId: true,
      requesterName: true,
    },
  });
  if (!reservation) return { ok: false, error: 'Aanvraag niet gevonden.' };

  const built = await buildTransportBookings(input, {
    userId: reservation.userId,
    eventId: reservation.eventId,
    requesterType: reservation.requesterType,
    groupId: reservation.groupId,
    requesterName: reservation.requesterName,
    reservationId: reservation.id,
    byTeam: true,
  });
  if (!built.ok) return { ok: false, error: built.error };

  await prisma.$transaction(async (tx) => {
    // Ook dit is een rit die het team zelf aanmaakt (vanaf "Levering nodig"), en
    // dus een die het weer mag weghalen; het lid vroeg materiaal, geen rit.
    await tx.uitleenTransportBooking.createMany({
      data: built.bookings.map((booking) => ({ ...booking, plannedByTeam: true })),
    });
    await writeAudit(tx, { reservationId: reservation.id }, {
      kind: 'NOTE',
      note: built.roundTrip
        ? 'Levering: heen- en terugrit aangemaakt bij transport.'
        : 'Levering: rit aangemaakt bij transport.',
      actorId: session.user.id,
    });
  });

  revalidateBeheer();
  return {
    ok: true,
    message: built.roundTrip
      ? 'Heen- en terugrit aangemaakt. Keur ze goed bij Transport.'
      : 'Rit aangemaakt. Keur ze goed bij Transport.',
  };
}

/**
 * De goedgekeurde ritten van hetzelfde voertuig waarmee dit tijdvenster botst.
 *
 * Aansluiten mag: een rit die om 12:00 eindigt, laat de kar om 12:00 vrij. Geeft
 * de ritten zelf terug en niet enkel een boolean: "voertuig bezet" zegt niet
 * waarheen je moet schuiven, en dat is precies wat het team wil weten.
 *
 * Alle botsende ritten en niet enkel de eerste: forceer je een overlap, dan hoort
 * de melding te zeggen met hoeveel dingen je nu botst, niet met eentje ervan.
 */
async function overlappingBookings(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  startAt: Date,
  endAt: Date,
  excludeIds: string[]
) {
  const others = await approvedTripsBetween(tx, vehicleId, startAt, endAt, excludeIds);
  return others.filter((other) => momentsOverlap(startAt, endAt, other.startAt, other.endAt));
}

/**
 * De goedgekeurde ritten van een voertuig die iets van dit venster raken.
 *
 * Met de datum in de query (P4): voordien haalde elke controle alle goedgekeurde
 * ritten van het voertuig op, sinds het begin, en filterde ze daarna. Dezelfde
 * voorwaarde als `momentsOverlap`, dus aansluiten blijft mogen.
 */
function approvedTripsBetween(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  from: Date,
  to: Date,
  excludeIds: string[]
) {
  return tx.uitleenTransportBooking.findMany({
    where: { vehicleId, status: 'APPROVED', id: { notIn: excludeIds }, startAt: { lt: to }, endAt: { gt: from } },
    select: { id: true, startAt: true, endAt: true, eventName: true, purpose: true },
  });
}

/**
 * `de rit "Tafels naar Alma 3" op za 12 september 2026, 14:00-18:00`, voor in
 * een melding. Waarvoor de rit dient en niet het evenement (`tripTitle`): twee
 * ritten die botsen, hangen vaak aan hetzelfde evenement.
 *
 * Het einde als enkel een uur zolang de rit binnen één dag blijft: de datum twee
 * keer voluit maakte er een zin van drie regels van, en dat is precies wat je in
 * een toast niet leest.
 */
function bookingLabel(booking: {
  eventName: string | null;
  purpose: string;
  startAt: Date;
  endAt: Date;
}): string {
  const what = tripTitle(booking);
  const sameDay = toBrusselsDateValue(booking.startAt) === toBrusselsDateValue(booking.endAt);
  const end = sameDay
    ? formatBrusselsTime(booking.endAt)
    : `tot ${formatDateTime(booking.endAt)}`;
  return `de rit "${what}" op ${formatDateTime(booking.startAt)}${sameDay ? `-${end}` : ` ${end}`}`;
}

/** "de rit van A ... en de rit van B ...", voor een melding over meerdere. */
function overlapLabel(clashes: Parameters<typeof bookingLabel>[0][]): string {
  return clashes.map(bookingLabel).join(' en ');
}

/**
 * Botsen mag tijdelijk, stil botsen niet.
 *
 * Het team tekent eerst in wat mensen vragen en schuift het daarna passend; die
 * volgorde was onmogelijk zolang een botsing hard geweigerd werd. Twee ritten met
 * hetzelfde voertuig op hetzelfde moment mogen dus bestaan, maar enkel wanneer
 * iemand daar expliciet voor tekent (`allowOverlap`), en dan met een regel in de
 * historiek, een waarschuwing in de melding en twee rode blokken in de planning
 * tot het opgelost is. Zie docs/design-decisions.md.
 */
function overlapAuditNote(clashes: Parameters<typeof bookingLabel>[0][]): string {
  return `bewust ingepland over ${overlapLabel(clashes)}`;
}

/**
 * Goedkeuren, met de mogelijkheid de uren te verschuiven.
 *
 * Twee aanvragen voor dezelfde kar op dezelfde dag passen vaak samen na een
 * halfuur schuiven; voordien kon het team enkel goedkeuren of afwijzen. Het
 * formulier draagt per rit een `startAt-<id>` en `endAt-<id>`; wat er niet in
 * staat, blijft zoals aangevraagd.
 *
 * Een heen-en-terugaanvraag (`tripGroupId`) wordt in haar geheel beslist: de
 * heenrit goedkeuren en de terugrit laten hangen, levert een aanvrager op die
 * niet meer thuisgeraakt.
 */
export async function approveTransportAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const bookingId = String(formData.get('bookingId') ?? '');
  const paymentMode = String(formData.get('paymentMode') ?? '');
  const driverId = String(formData.get('driverId') ?? '').trim();
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (paymentMode !== 'ONLINE' && paymentMode !== 'OFFLINE') return saveError('MODE_REQUIRED');
  // De keuzelijst toont enkel chauffeurs, maar een formulier is te vervalsen; en
  // een toegewezen rit is meteen ook leestoegang tot die rit ("Mijn ritten").
  if (driverId && !(await isDriver(driverId))) return saveError('NOT_A_DRIVER');

  // Botsen mag, maar enkel bewust: zonder dit vinkje weigert het goedkeuren nog
  // altijd en zegt het waarmee. Zie `overlapAuditNote`.
  const allowOverlap = String(formData.get('allowOverlap') ?? '') === 'on';

  const outcome = await runSerializable(
    async (
      tx
    ): Promise<{
      error: string | null;
      detail?: string;
      legIds?: string[];
      shifts?: string[];
      overlaps?: string[];
    }> => {
      const booking = await tx.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
      if (!booking) return { error: 'NOT_FOUND' as const };

      // Standaard beslist het team over de hele aanvraag: heen zonder terug
      // laat iemand ter plaatse staan. Maar soms kan de heenrit wel en moet de
      // terugrit nog verschuiven, en dan is de heenrit alvast vastleggen beter
      // dan allebei laten hangen (T2). Vandaar een expliciete keuze in het
      // formulier in plaats van stilzwijgend één van de twee.
      const separate = String(formData.get('scope') ?? '') === 'single';
      const legs =
        booking.tripGroupId && !separate
          ? await tx.uitleenTransportBooking.findMany({
              where: { tripGroupId: booking.tripGroupId },
              orderBy: { startAt: 'asc' },
            })
          : [booking];
      if (legs.some((leg) => leg.status !== 'REQUESTED')) return { error: 'NOT_REQUESTED' as const };

      const groupIds = legs.map((leg) => leg.id);
      const planned: Array<{ leg: (typeof legs)[number]; startAt: Date; endAt: Date }> = [];

      for (const leg of legs) {
        const startRaw = String(formData.get(`startAt-${leg.id}`) ?? '').trim();
        const endRaw = String(formData.get(`endAt-${leg.id}`) ?? '').trim();
        const startAt = startRaw ? parseBrusselsDateTime(startRaw) : leg.startAt;
        const endAt = endRaw ? parseBrusselsDateTime(endRaw) : leg.endAt;
        if (!startAt || !endAt) return { error: 'TIME_INVALID' as const };
        if (endAt <= startAt) return { error: 'TIME_ORDER' as const };
        if (!isOnQuarterHour(startAt) || !isOnQuarterHour(endAt)) {
          return { error: 'TIME_QUARTER' as const };
        }
        planned.push({ leg, startAt, endAt });
      }

      // Per voertuig: twee goedgekeurde ritten op hetzelfde moment mogen enkel
      // met het vinkje. De andere helft van dezelfde aanvraag telt niet mee als
      // conflict met zichzelf, maar mag wel niet over de eigen heenrit vallen.
      const overlapsPerLeg = new Map<string, string>();
      for (const [index, entry] of planned.entries()) {
        const clashes = await overlappingBookings(
          tx,
          entry.leg.vehicleId,
          entry.startAt,
          entry.endAt,
          groupIds
        );
        if (clashes.length > 0) {
          if (!allowOverlap) return { error: 'OVERLAP' as const, detail: overlapLabel(clashes) };
          overlapsPerLeg.set(entry.leg.id, overlapAuditNote(clashes));
        }
        // Blijft wel hard: dat de heen- en terugrit van één aanvraag hetzelfde
        // voertuig op hetzelfde moment claimen, is geen planningskeuze maar een
        // fout in de aanvraag. Daar helpt schuiven, niet doorduwen.
        const sibling = planned.find(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.leg.vehicleId === entry.leg.vehicleId &&
            momentsOverlap(entry.startAt, entry.endAt, other.startAt, other.endAt)
        );
        if (sibling) return { error: 'SELF_OVERLAP' as const };
      }

      const shifts: string[] = [];
      for (const { leg, startAt, endAt } of planned) {
        const shifted = startAt.getTime() !== leg.startAt.getTime() || endAt.getTime() !== leg.endAt.getTime();
        await tx.uitleenTransportBooking.update({
          where: { id: leg.id },
          data: {
            status: 'APPROVED',
            startAt,
            endAt,
            paymentMode,
            driverId: driverId || null,
            adminNote: adminNote || null,
            // Prijs definitief maken volgens de gesnapshotte tariefmodus. Blijft null
            // voor per-km-ritten: die prijs wordt pas bij afronden gekend.
            priceCents: transportPriceCents({
              pricingMode: leg.pricingMode,
              rateCents: leg.rateCents,
              startAt,
              endAt,
            }),
            decidedAt: new Date(),
            decidedById: session.user.id,
          },
        });
        await writeAudit(tx, { transportBookingId: leg.id }, {
          kind: 'STATUS_CHANGED',
          fromStatus: leg.status,
          toStatus: 'APPROVED',
          note: paymentMode === 'ONLINE' ? 'online betalen' : 'betalen aan de balie',
          actorId: session.user.id,
        });
        // Verschoven uren zijn een wijziging aan de aanvraag: die hoort apart in
        // de historiek, want de nieuwe uren staan straks als "de" uren op de rit.
        if (shifted) {
          const shift = `Uren verschoven bij goedkeuring: ${formatDateTime(leg.startAt)} tot ${formatDateTime(leg.endAt)} werd ${formatDateTime(startAt)} tot ${formatDateTime(endAt)}`;
          shifts.push(shift);
          await writeAudit(tx, { transportBookingId: leg.id }, {
            kind: 'EDITED',
            note: shift,
            actorId: session.user.id,
          });
        }
        // Een geforceerde botsing hoort in de historiek: over een week weet
        // niemand nog of dat rode blok een keuze was of een ongeluk.
        const overlapNote = overlapsPerLeg.get(leg.id);
        if (overlapNote) {
          await writeAudit(tx, { transportBookingId: leg.id }, {
            kind: 'NOTE',
            note: overlapNote,
            actorId: session.user.id,
          });
        }
      }
      return { error: null, legIds: groupIds, shifts, overlaps: [...overlapsPerLeg.values()] };
    }
  );

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'NOT_REQUESTED') return saveError('NOT_REQUESTED');
  if (outcome.error === 'TIME_INVALID') return saveError('TIME_INVALID');
  if (outcome.error === 'TIME_ORDER') return saveError('TIME_ORDER');
  if (outcome.error === 'TIME_QUARTER') return saveError('TIME_QUARTER');
  if (outcome.error === 'SELF_OVERLAP') return saveError('SELF_OVERLAP');
  if (outcome.error === 'OVERLAP') {
    return saveError(
      'OVERLAP',
      `Botst met ${outcome.detail}. Verschuif de uren, wijs af, of vink "toch goedkeuren" aan.`
    );
  }

  // Zijn de uren verschoven, dan is dat het nieuws; anders volstaat de betaalwijze.
  await notifyTransport(
    outcome.legIds ?? [bookingId],
    'APPROVED',
    outcome.shifts && outcome.shifts.length > 0
      ? outcome.shifts.join('\n')
      : paymentMode === 'ONLINE'
        ? 'Betalen gebeurt online; je vindt de betaalknop bij je rit.'
        : 'Betalen gebeurt aan de balie.',
    { actorId: session.user.id }
  );

  revalidateBeheer();
  // De waarschuwing hoort in de bevestiging: wie forceert, moet daarna nog
  // kunnen zien waarmee, zonder de historiek open te slaan.
  const overlaps = outcome.overlaps ?? [];
  return saveOk(
    overlaps.length > 0
      ? `Goedgekeurd, maar het voertuig staat nu dubbel geboekt: ${overlaps.join('; ')}. Verschuif een van beide in de planning.`
      : undefined
  );
}

export async function rejectTransportAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const bookingId = String(formData.get('bookingId') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (!adminNote) return saveError('NOTE_REQUIRED');

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return saveError('NOT_FOUND');

  // Net als bij goedkeuren: een heen-en-terugaanvraag wijs je in haar geheel af.
  const legs = booking.tripGroupId
    ? await prisma.uitleenTransportBooking.findMany({ where: { tripGroupId: booking.tripGroupId } })
    : [booking];
  if (legs.some((leg) => leg.status !== 'REQUESTED')) return saveError('NOT_REQUESTED');

  for (const leg of legs) {
    await prisma.uitleenTransportBooking.update({
      where: { id: leg.id },
      data: { status: 'REJECTED', adminNote, decidedAt: new Date(), decidedById: session.user.id },
    });
    await writeAudit(prisma, { transportBookingId: leg.id }, {
      kind: 'STATUS_CHANGED',
      fromStatus: leg.status,
      toStatus: 'REJECTED',
      note: `reden: ${adminNote}`,
      actorId: session.user.id,
    });
  }
  await notifyTransport(
    legs.map((leg) => leg.id),
    'REJECTED',
    adminNote,
    { actorId: session.user.id }
  );

  revalidateBeheer();
  return saveOk();
}

/**
 * Een rit echt verwijderen (R1).
 *
 * **Elke rit**, ook een gereden rit of een rit uit een aanvraag die iemand
 * anders inplande of goedkeurde. Tot september 2026 mocht enkel een rit weg die
 * het team zelf intekende, met als gedachte dat een lid een reden hoort te zien
 * in plaats van een lege plek. In de praktijk bleven zo ritten op de planning
 * staan die geen beheerder kwijt kon. Afwijzen blijft de weg wanneer de
 * aanvrager moet horen waarom; bij zo'n rit zegt de bevestigingsdialoog dat
 * (`transportDeleteDescription`), want verwijderen stuurt geen bericht.
 *
 * Wat er mee verdwijnt: de historiek (`UitleenAuditLog`) en de bijrijders staan
 * allebei op `onDelete: Cascade`. Dat is de reden dat de bevestigingsdialoog het
 * hardop zegt.
 *
 * De enige weigering is een betaling, en die is géén beleidskeuze maar een
 * databankregel: `UitleenPayment.transportBooking` staat op `onDelete: Restrict`,
 * dus zonder deze controle faalt het verwijderen met een Prisma-fout in plaats
 * van met een zin die zegt wat er in de weg staat.
 */
export async function deleteTransportAction(bookingId: string): Promise<ActionResult> {
  await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, tripGroupId: true },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };

  // Heen en terug (of twee voertuigen) zijn samen ingetekend en gaan samen weg,
  // net zoals annuleren en afwijzen de hele groep behandelen: één helft
  // verwijderen laat een rit staan die niemand meer gaat rijden.
  const legs = await prisma.uitleenTransportBooking.findMany({
    where: booking.tripGroupId ? { tripGroupId: booking.tripGroupId } : { id: booking.id },
    select: {
      id: true,
      _count: { select: { payments: true } },
    },
  });

  if (legs.some((leg) => leg._count.payments > 0)) {
    return {
      ok: false,
      error: 'Aan deze rit hangt een betaling. Rond ze af of mail logistiek@vtk.be.',
    };
  }

  const { count } = await prisma.uitleenTransportBooking.deleteMany({
    where: { id: { in: legs.map((leg) => leg.id) } },
  });

  revalidateBeheer();
  return {
    ok: true,
    message: count > 1 ? `${count} ritten verwijderd.` : 'Rit verwijderd.',
  };
}

/**
 * Een rit aanmaken vanuit de planning (P4).
 *
 * Meteen `APPROVED` en niet `REQUESTED`: het team vraagt niets aan zichzelf. Een
 * rit die de transportverantwoordelijke zelf inplant, is beslist op het moment
 * dat hij ze intekent; ze daarna nog eens laten goedkeuren zou een lege stap
 * zijn die vroeg of laat blijft openstaan.
 *
 * Daarom loopt de botsingscontrole hier wél meteen (een goedgekeurde rit houdt
 * het voertuig bezet), terwijl een aanvraag van een lid nog mag botsen; zie
 * "Conflicten: aanvragen mag, goedkeuren niet".
 *
 * De rit komt op naam van de aanvrager die het team kiest, of op die van het
 * teamlid zelf wanneer er geen gekozen wordt. Wie eronder staat, bepaalt wie ze
 * bij "Mijn aanvragen" ziet.
 */
export async function adminCreateTransportAction(
  input: TransportFormInput & {
    groupId?: string | null;
    requesterType?: UitleenRequesterType;
    requesterName?: string | null;
    userId?: string | null;
    eventId?: string | null;
    driverId?: string | null;
    /**
     * De post die de rit zelf mag invullen, of null. Hetzelfde als
     * `assignTripGroupAction` achteraf doet, maar meteen bij het intekenen: het
     * team plant vaak een rit in precies omdat er nog geen chauffeur is, en die
     * rit dan eerst opslaan om ze daarna opnieuw te moeten openen, is een stap
     * die niets beslist.
     */
    assignedGroupId?: string | null;
    /** Bewust over een bestaande rit inplannen; zie `overlapAuditNote`. */
    allowOverlap?: boolean;
    /** Herhaal deze rit (F6.22): C&G, het containerpark, de BO-rit. */
    repeat?: { rule: RecurrenceRule; end: RecurrenceEnd };
  }
): Promise<ActionResult> {
  const session = await requireManage();

  const ownerId = input.userId?.trim() || session.user.id;
  const requesterType = input.requesterType ?? 'INTERN';
  const requesterName = input.requesterName?.trim().slice(0, 200) || null;

  // Een interne aanvraag wordt benoemd door haar post (`requesterLabel` valt
  // daarop terug); elk ander type heeft enkel deze naam. Ontbreekt die, dan staat
  // de rit als kale "Werkgroep" of "Extern" in de planning en is "voor wie is
  // dit" precies de vraag die je niet meer beantwoord krijgt. De client checkt
  // het ook, maar de client is de poort niet.
  if (requesterType !== 'INTERN' && !requesterName) {
    return { ok: false, error: 'Vul in voor wie deze rit rijdt, of kies een post.' };
  }

  const owner = {
    userId: ownerId,
    eventId: input.eventId?.trim() || null,
    requesterType,
    groupId: input.groupId?.trim() || null,
    requesterName,
    byTeam: true,
  };
  const built = input.repeat
    ? await buildTransportSeries(input, owner, input.repeat)
    : await buildTransportBookings(input, owner);
  if (!built.ok) return { ok: false, error: built.error };

  // Een chauffeur toewijzen mag enkel aan iemand uit de chauffeurslijst; dat is
  // meteen leestoegang tot die rit, dus dezelfde hercheck als bij het goedkeuren.
  const driverId = input.driverId?.trim() || null;
  if (driverId && !(await isDriver(driverId))) {
    return { ok: false, error: 'Deze persoon staat niet in de chauffeurslijst.' };
  }

  // Doorgeven aan een post, met dezelfde twee regels als `assignTripGroupAction`:
  // de post moet bestaan, en de kar gaat niet mee (die vraagt een goedgekeurde
  // karchauffeur). Het formulier toont de keuzelijst niet bij de kar, maar een
  // keuzelijst is de poort niet.
  const assignedGroupId = input.assignedGroupId?.trim() || null;
  let assignedGroup: { id: string; nameNl: string } | null = null;
  if (assignedGroupId) {
    assignedGroup = await prisma.group.findFirst({
      where: { id: assignedGroupId, active: true },
      select: { id: true, nameNl: true },
    });
    if (!assignedGroup) return { ok: false, error: 'Die post of werkgroep bestaat niet meer.' };
    const van = await prisma.uitleenVehicle.findFirst({
      where: { id: { in: built.bookings.map((booking) => booking.vehicleId) }, needsVanDriver: true },
      select: { nameNl: true },
    });
    if (van) {
      return {
        ok: false,
        error: `${van.nameNl} vraagt een goedgekeurde karchauffeur en kan niet aan een post doorgegeven worden.`,
      };
    }
  }

  const outcome = await runSerializable(async (tx) => {
    // Per rit apart, zodat de historiekregel bij de rit staat die effectief
    // over een andere valt.
    const overlapsPerIndex = new Map<number, string>();
    for (const [index, booking] of built.bookings.entries()) {
      const clashes = await overlappingBookings(
        tx,
        booking.vehicleId,
        booking.startAt as Date,
        booking.endAt as Date,
        []
      );
      if (clashes.length > 0) {
        if (!input.allowOverlap) return { error: 'OVERLAP' as const, detail: overlapLabel(clashes) };
        overlapsPerIndex.set(index, overlapAuditNote(clashes));
      }
    }
    const now = new Date();
    const created = await tx.uitleenTransportBooking.createManyAndReturn({
      data: built.bookings.map((booking) => ({
        ...booking,
        status: 'APPROVED' as const,
        // Zelf ingetekend, dus later ook zelf weg te halen (R1). Zie de comment
        // bij het veld in schema.prisma.
        plannedByTeam: true,
        driverId,
        assignedGroupId: assignedGroup?.id ?? null,
        // Een herhaling: alle ritten delen dit (F6.22). `null` bij één rit.
        seriesId: built.seriesId ?? null,
        decidedAt: now,
        decidedById: session.user.id,
        // Het team tekent dit zelf in en vraagt niets aan zichzelf; direct
        // gemarkeerd zodat deze ritten nooit in de team-digest terechtkomen.
        teamNotifiedAt: now,
      })),
      select: { id: true },
    });
    for (const [index, row] of created.entries()) {
      await writeAudit(tx, { transportBookingId: row.id }, {
        kind: 'STATUS_CHANGED',
        toStatus: 'APPROVED',
        // De tekst "ingepland door Logistiek" is een sleutel: de migratie van
        // `plannedByTeam` leest ze terug. Het staartje eronder niet.
        note: 'ingepland door Logistiek',
        actorId: session.user.id,
      });
      if (built.seriesId) {
        await writeAudit(tx, { transportBookingId: row.id }, {
          kind: 'NOTE',
          note: `Deel van een reeks van ${built.occurrences ?? created.length} ritten`,
          actorId: session.user.id,
        });
      }
      // Een rit in het verleden is administratie (F6.19); dat hoort in de
      // historiek te staan, want ze telt mee in de statistieken.
      if ((built.bookings[index]?.startAt as Date) <= now) {
        await writeAudit(tx, { transportBookingId: row.id }, {
          kind: 'NOTE',
          note: 'Ingepland met terugwerkende kracht: het startmoment lag in het verleden.',
          actorId: session.user.id,
        });
      }
      const overlapNote = overlapsPerIndex.get(index);
      if (overlapNote) {
        await writeAudit(tx, { transportBookingId: row.id }, {
          kind: 'NOTE',
          note: overlapNote,
          actorId: session.user.id,
        });
      }
    }
    return {
      error: null,
      ids: created.map((row) => row.id),
      overlaps: [...overlapsPerIndex.values()],
    };
  });

  if (outcome.error === 'OVERLAP') {
    return {
      ok: false,
      error: `Botst met ${outcome.detail}. Kies een ander moment, of plan de rit toch in.`,
      code: 'OVERLAP',
    };
  }

  revalidateBeheer();
  const overlaps = outcome.overlaps ?? [];
  // Bij een reeks kunnen het er tientallen zijn; de eerste drie zeggen genoeg en de
  // rest staat als rode blokken in de planning.
  const shownOverlaps = overlaps.slice(0, 3).join('; ');
  const moreOverlaps = overlaps.length > 3 ? ` en nog ${overlaps.length - 3}` : '';
  const base =
    overlaps.length > 0
      ? `Ingepland, maar het voertuig staat nu dubbel geboekt: ${shownOverlaps}${moreOverlaps}. Verschuif een van beide.`
      : built.seriesId
        ? `Reeks van ${built.occurrences ?? 'meerdere'} ritten ingepland.`
        : built.roundTrip || built.vehicleCount > 1
          ? 'Ritten ingepland.'
          : 'Rit ingepland.';
  if (!assignedGroup) return { ok: true, warning: overlaps.length > 0, message: base };

  // Ná de write, zoals elke mail hier, en per aangemaakte rit: zijn het er meer
  // dan een (heen en terug, of twee voertuigen), dan zoekt de post voor elk
  // daarvan een chauffeur en gaat het dus over meer dan een rit.
  revalidatePath('/ritten');
  const outcomes: TripHandoverOutcome[] = [];
  // Bij een reeks één bericht en niet één per herhaling: een post die vijftig
  // mails krijgt voor wat één afspraak is, leest er geen enkele meer.
  const toNotify = built.seriesId ? (outcome.ids ?? []).slice(0, 1) : (outcome.ids ?? []);
  for (const id of toNotify) {
    outcomes.push(await notifyGroupAssignedForTrip(id));
  }
  const note = handoverNote(assignedGroup.nameNl, mergeHandover(outcomes));
  return {
    ok: true,
    // Gelukt met een staartje: de melding blijft staan tot je ze wegklikt, want
    // ze vraagt nog iets van je.
    warning: overlaps.length > 0 || note.warning,
    message: `${base} ${note.message}`,
  };
}

/**
 * De ritten van een herhaling vóór ze bestaan (F6.22), met welke botsen.
 *
 * Twaalf ritten aanmaken om er daarna twee rood te zien staan, is de fout die dit
 * voorkomt. Het schrijft niets: dezelfde `seriesOccurrences` en dezelfde
 * botsingscontrole als `adminCreateTransportAction`, maar enkel om te tonen.
 */
export async function previewTripSeriesAction(input: {
  startAt: string;
  endAt: string;
  vehicleId: string;
  repeat: { rule: RecurrenceRule; end: RecurrenceEnd };
}): Promise<
  | {
      ok: true;
      items: Array<{ startAt: string; endAt: string; clash: string | null }>;
      /** Het maximum is bereikt: er zouden er meer geweest zijn. */
      capped: boolean;
    }
  | { ok: false; error: string }
> {
  await requireManage();
  if (!input.startAt || !input.endAt) {
    return { ok: false, error: 'Kies eerst een start- en eindmoment.' };
  }
  const windows = seriesOccurrences(
    { startAt: input.startAt, endAt: input.endAt },
    input.repeat.rule,
    input.repeat.end
  );
  if (windows.length === 0) return { ok: false, error: 'Kies eerst een start- en eindmoment.' };

  const parsed: Array<{ window: (typeof windows)[number]; startAt: Date; endAt: Date }> = [];
  for (const window of windows) {
    const startAt = parseBrusselsDateTime(window.startAt);
    const endAt = parseBrusselsDateTime(window.endAt);
    if (!startAt || !endAt) return { ok: false, error: 'Vul een geldig begin- en einduur in.' };
    parsed.push({ window, startAt, endAt });
  }

  // Eén query voor de hele reeks in plaats van één per herhaling (P4): de
  // ritten tussen het eerste begin en het laatste einde, en dan per herhaling
  // in het geheugen welke daarvan botsen.
  const from = new Date(Math.min(...parsed.map((entry) => entry.startAt.getTime())));
  const to = new Date(Math.max(...parsed.map((entry) => entry.endAt.getTime())));
  const others = input.vehicleId ? await approvedTripsBetween(prisma, input.vehicleId, from, to, []) : [];

  const items = parsed.map(({ window, startAt, endAt }) => {
    const clashes = others.filter((other) => momentsOverlap(startAt, endAt, other.startAt, other.endAt));
    return { ...window, clash: clashes.length > 0 ? overlapLabel(clashes) : null };
  });
  return { ok: true, items, capped: windows.length >= MAX_SERIES_OCCURRENCES };
}

/**
 * Een rit en alle volgende van haar reeks verwijderen (F6.22).
 *
 * Enkel "vanaf hier", nooit de hele reeks met wat al gereden is: gereden ritten
 * (`COMPLETED`) en ritten met een betaling blijven staan, want dat is
 * geschiedenis en een databankregel (zie `deleteTransportAction`). De melding
 * zegt hoeveel er bleven. Elke andere rit van de reeks, ook een eerdere die nog
 * niet gereden is, blijft ongemoeid.
 */
export async function deleteTripSeriesFromAction(bookingId: string): Promise<ActionResult> {
  await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, seriesId: true, startAt: true },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (!booking.seriesId) return { ok: false, error: 'Deze rit hoort niet bij een reeks.' };

  const following = await prisma.uitleenTransportBooking.findMany({
    where: { seriesId: booking.seriesId, startAt: { gte: booking.startAt } },
    select: { id: true, status: true, _count: { select: { payments: true } } },
  });
  const removable = following.filter(
    (row) => row.status !== 'COMPLETED' && row._count.payments === 0
  );
  const kept = following.length - removable.length;

  const { count } = await prisma.uitleenTransportBooking.deleteMany({
    where: { id: { in: removable.map((row) => row.id) } },
  });

  revalidateBeheer();
  return {
    ok: true,
    message:
      `${count === 1 ? '1 rit' : `${count} ritten`} van de reeks verwijderd.` +
      (kept > 0 ? ` ${kept} bleven staan omdat ze al gereden zijn of een betaling hebben.` : ''),
  };
}

/**
 * Een rit aanpassen vanuit de planning (P4).
 *
 * Dit is de tegenhanger van `editVanBookingAction` (het lid past zijn eigen rit
 * aan) voor het team: die van het lid haalt een goedgekeurde rit terug naar
 * REQUESTED omdat er dan opnieuw beslist moet worden, terwijl het team het hier
 * juist zélf beslist. De status blijft dus staan, en de overlapcontrole gebeurt
 * meteen, in dezelfde Serializable-transactie als bij het goedkeuren.
 *
 * Wat je hier niet doet: goedkeuren, afwijzen, afronden of een chauffeur
 * toewijzen. Die hebben elk hun eigen actie met hun eigen regels; dit gaat over
 * de feiten van de rit. Ook het evenement staat hier niet (meer): dat zet
 * `linkToEventAction`, voor beide helften samen en ook op een gereden rit. Tot
 * september 2026 kon het hier ook, maar dan enkel voor deze helft, en een sleep
 * in de kalender stuurde de koppeling ongemerkt mee.
 *
 * **Voor wie de rit rijdt, hoort wél bij die feiten** (F4.4). Dat lag tot
 * september 2026 vast bij het aanmaken, terwijl een rit die op de verkeerde post
 * staat precies iets is dat je pas later ziet. Twee grenzen blijven:
 *
 * - **Een rit wordt hier niet extern.** Enkel een externe krijgt prijs, tarief
 *   en betaalstatus (`chargesRequester`), en die knop omzetten in een keuzelijst
 *   maakt van een geldbeslissing een tikfout. Dezelfde regel als bij het
 *   intekenen, waar "Andere..." een werkgroep wordt en geen externe.
 * - **Een externe rit met een betaling verhuist niet.** Bij een post verdwijnen
 *   prijs en betaalstatus van het scherm, en een betaald bedrag dat nergens meer
 *   staat, is erger dan een rit op de verkeerde naam.
 *
 * Het tarief zelf blijft staan: `pricingMode` en `rateCents` zijn momentopnames
 * en worden nooit herrekend (zie docs/uitleendienst.md). Het formulier zegt dat,
 * in plaats van het stil te doen.
 */
export async function adminEditTransportAction(
  bookingId: string,
  input: {
    startAt: string;
    endAt: string;
    purpose: string;
    cargoNote: string;
    pickupAddress: string;
    destination: string;
    adminNote: string;
    /**
     * Voor wie de rit rijdt (F4.4). Weglaten laat het staan: een sleep in de
     * kalender wijzigt enkel de uren en mag een rit niet stil van post
     * veranderen.
     *
     * Eén object en geen drie losse velden, want ze horen samen: een type zonder
     * naam, of een naam naast een post, is geen halve wijziging maar een foute.
     */
    requester?: { type: UitleenRequesterType; groupId: string | null; name: string | null };
    /** Bewust over een bestaande rit schuiven; zie `overlapAuditNote`. */
    allowOverlap?: boolean;
  }
): Promise<ActionResult> {
  const session = await requireManage();

  const purpose = input.purpose.trim();
  if (!purpose) return { ok: false, error: 'Beschrijf waarvoor de rit dient.' };

  const startAt = parseBrusselsDateTime(input.startAt);
  const endAt = parseBrusselsDateTime(input.endAt);
  if (!startAt || !endAt) return { ok: false, error: 'Vul een geldig begin- en einduur in.' };
  if (endAt <= startAt) return { ok: false, error: 'Het einduur ligt voor het beginuur.' };
  if (!isOnQuarterHour(startAt) || !isOnQuarterHour(endAt)) {
    return { ok: false, error: 'Kies uren op het kwartier (bv. 14:00, 14:15).' };
  }

  // Buiten de transactie: de post bestaat los van deze rit, en een
  // Serializable-transactie die er een tweede tabel bij leest, is er een die
  // vaker opnieuw moet. `label` is wat er in de historiek komt te staan, in de
  // woorden van de keuzelijst waarmee je het net veranderde ("Logistiek zelf" en niet "Interne
  // post"): een historiekregel die iets anders noemt dan de knop, laat je twee
  // keer nadenken over één wijziging.
  let requester:
    | { type: UitleenRequesterType; groupId: string | null; name: string | null; label: string }
    | null = null;
  if (input.requester) {
    const type = input.requester.type;
    if (type === 'INTERN') {
      const groupId = input.requester.groupId?.trim() || null;
      let group: { id: string; nameNl: string } | null = null;
      if (groupId) {
        group = await prisma.group.findFirst({
          where: { id: groupId, active: true },
          select: { id: true, nameNl: true },
        });
        if (!group) return { ok: false, error: 'Die post of werkgroep bestaat niet meer.' };
      }
      requester = {
        type,
        groupId: group?.id ?? null,
        name: null,
        label: group?.nameNl ?? 'Logistiek zelf',
      };
    } else {
      // Zoals bij het intekenen: zonder naam staat de rit als kale "Werkgroep"
      // in de planning, en dan is "voor wie is dit" precies de vraag die je niet
      // meer beantwoord krijgt.
      const name = input.requester.name?.trim().slice(0, 200) || null;
      if (!name) return { ok: false, error: 'Vul in voor wie deze rit rijdt, of kies een post.' };
      requester = { type, groupId: null, name, label: name };
    }
  }

  const outcome = await runSerializable(async (tx) => {
    const existing = await tx.uitleenTransportBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        vehicleId: true,
        startAt: true,
        endAt: true,
        purpose: true,
        cargoNote: true,
        pickupAddress: true,
        destination: true,
        adminNote: true,
        pricingMode: true,
        rateCents: true,
        requesterType: true,
        groupId: true,
        requesterName: true,
        group: { select: { nameNl: true } },
        // Enkel om te weten of er geld aan hangt; zie de betaalcheck hieronder.
        paidOfflineAt: true,
        _count: { select: { payments: true } },
      },
    });
    if (!existing) return { error: 'NOT_FOUND' as const };
    // Een gereden rit is geschiedenis; die uren aanpassen zou de historiek en de
    // afgerekende kilometers laten liegen.
    if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
      return { error: 'LOCKED' as const };
    }

    if (requester) {
      const wasCharged = chargesRequester(existing.requesterType);
      const willCharge = chargesRequester(requester.type);
      if (!wasCharged && willCharge) return { error: 'NO_EXTERN' as const };
      // Een betaling hangt aan de rit (`UitleenPayment`) of staat als offline
      // ontvangen gestempeld. Bij een post verdwijnen prijs en betaalstatus van
      // beide schermen, dus dat bedrag zou nergens meer staan.
      if (wasCharged && !willCharge && (existing.paidOfflineAt !== null || existing._count.payments > 0)) {
        return { error: 'PAID' as const };
      }
    }

    // Enkel een goedgekeurde rit houdt een voertuig bezet; een aanvraag mag nog
    // botsen (zie "Conflicten: aanvragen mag, goedkeuren niet").
    //
    // Enkel wanneer het venster verschuift. Een rit die het team met opzet over
    // een andere zette (om eerst het geheel te overzien en daarna te schuiven),
    // moest anders bij elke opslag, ook voor een nota of een adres, "Toch
    // verschuiven" bevestigen terwijl er niets verschuift, en schreef elke keer
    // opnieuw een overlap-nota in de historiek (F6.26).
    let overlapNote: string | null = null;
    if (existing.status === 'APPROVED' && windowMoved(existing, { startAt, endAt })) {
      const clashes = await overlappingBookings(tx, existing.vehicleId, startAt, endAt, [bookingId]);
      if (clashes.length > 0) {
        if (!input.allowOverlap) return { error: 'OVERLAP' as const, detail: overlapLabel(clashes) };
        overlapNote = overlapAuditNote(clashes);
      }
    }

    const changes: string[] = [];
    const moved =
      startAt.getTime() !== existing.startAt.getTime() || endAt.getTime() !== existing.endAt.getTime();
    if (moved) {
      changes.push(
        `Uren: ${formatDateTime(existing.startAt)} tot ${formatDateTime(existing.endAt)} werd ${formatDateTime(startAt)} tot ${formatDateTime(endAt)}`
      );
    }
    const field = (label: string, before: string | null, after: string | null) => {
      if ((before ?? '') === (after ?? '')) return;
      changes.push(`${label}: ${before?.trim() || 'leeg'} → ${after?.trim() || 'leeg'}`);
    };
    field('Waarvoor', existing.purpose, purpose);
    field('Lading', existing.cargoNote, input.cargoNote.trim() || null);
    field('Laadadres', existing.pickupAddress, input.pickupAddress.trim() || null);
    field('Bestemming', existing.destination, input.destination.trim() || null);
    field('Nota van Logistiek', existing.adminNote, input.adminNote.trim() || null);
    // Alle drie de velden vergelijken en niet enkel de post: van werkgroep
    // "Alumni" naar werkgroep "Faculteit" verandert enkel de naam.
    const requesterChanged =
      requester !== null &&
      (requester.type !== existing.requesterType ||
        requester.groupId !== existing.groupId ||
        requester.name !== existing.requesterName);
    if (requesterChanged && requester) {
      const before =
        existing.requesterType === 'INTERN'
          ? (existing.group?.nameNl ?? 'Logistiek zelf')
          : (existing.requesterName ?? REQUESTER_TYPE_LABELS[existing.requesterType]);
      changes.push(`Voor wie: ${before} → ${requester.label}`);
    }
    if (changes.length === 0) return { error: 'NO_CHANGES' as const };

    await tx.uitleenTransportBooking.update({
      where: { id: bookingId },
      data: {
        startAt,
        endAt,
        purpose: purpose.slice(0, 1000),
        cargoNote: input.cargoNote.trim().slice(0, 1000) || null,
        pickupAddress: input.pickupAddress.trim().slice(0, 300) || null,
        destination: input.destination.trim().slice(0, 300) || null,
        adminNote: input.adminNote.trim().slice(0, 1000) || null,
        // De drie samen of geen van drie: een type dat wijzigt terwijl de naam
        // blijft staan, levert een rit op die als post én als werkgroep leest.
        ...(requesterChanged && requester
          ? {
              requesterType: requester.type,
              groupId: requester.groupId,
              requesterName: requester.name,
            }
          : {}),
        // De prijs volgt de uren bij een per-uur-tarief; bij per km blijft ze
        // null tot het afronden.
        priceCents: transportPriceCents({
          pricingMode: existing.pricingMode,
          rateCents: existing.rateCents,
          startAt,
          endAt,
        }),
      },
    });
    await writeAudit(tx, { transportBookingId: bookingId }, {
      kind: 'EDITED',
      note: changes.join('; '),
      actorId: session.user.id,
    });
    if (overlapNote) {
      await writeAudit(tx, { transportBookingId: bookingId }, {
        kind: 'NOTE',
        note: overlapNote,
        actorId: session.user.id,
      });
    }
    return { error: null, changes, overlapNote };
  });

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Deze rit bestaat niet meer.' };
  if (outcome.error === 'LOCKED') {
    return { ok: false, error: 'Deze rit is afgerond of geannuleerd; daar kan niets meer aan.' };
  }
  if (outcome.error === 'OVERLAP') {
    return {
      ok: false,
      error: `Botst met ${outcome.detail}. Kies een ander moment, of schuif de rit er toch over.`,
      code: 'OVERLAP',
    };
  }
  if (outcome.error === 'NO_EXTERN') {
    return {
      ok: false,
      error:
        'Een rit extern maken kan hier niet: enkel een externe aanvraag krijgt een prijs en een betaalstatus. Kies een post, of "Andere..." voor een werkgroep.',
    };
  }
  if (outcome.error === 'PAID') {
    return {
      ok: false,
      error:
        'Aan deze rit hangt een betaling. Bij een post verdwijnen prijs en betaalstatus van het scherm, dus die verhuizing kan niet.',
    };
  }
  if (outcome.error === 'NO_CHANGES') return { ok: true, message: 'Niets gewijzigd.' };

  // Ná de transactie, zoals elke mail hier: anders vertrekt er bericht over een
  // wijziging die door een rollback nooit gebeurd is.
  await notifyTransport([bookingId], 'EDITED', outcome.changes?.join('\n'), { actorId: session.user.id });

  revalidateBeheer();
  return {
    ok: true,
    warning: Boolean(outcome.overlapNote),
    message: outcome.overlapNote
      ? `Aangepast, maar het voertuig staat nu dubbel geboekt (${outcome.overlapNote.replace('bewust ingepland over ', '')}). Verschuif een van beide.`
      : 'Rit aangepast.',
  };
}

/** Chauffeur toewijzen of wijzigen; kan op elk moment voor de rit afgerond is. */
export async function assignDriverAction(bookingId: string, driverId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status === 'REJECTED' || booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return { ok: false, error: 'Voor deze rit kan je geen chauffeur meer toewijzen.' };
  }
  if (driverId && !(await isDriver(driverId))) {
    return { ok: false, error: 'Deze persoon staat niet in de chauffeurslijst.' };
  }

  const driver = driverId
    ? await prisma.user.findUnique({ where: { id: driverId }, select: { name: true } })
    : null;

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { driverId: driverId || null },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'EDITED',
    note: driver ? `chauffeur: ${driver.name}` : 'chauffeur verwijderd',
    actorId: session.user.id,
  });

  revalidateBeheer();
  if (!driverId) return { ok: true, message: 'Chauffeur verwijderd.' };

  // Een waarschuwing en geen blokkade (V1): de app kent de agenda van deze
  // chauffeur niet, hij wel. Wie nog nooit iets ingaf, krijgt er ook geen; `null`
  // betekent "niet gekend" en niet "kan niet".
  //
  // De soort staat in de melding en niet enkel "wel of niet": iemand die "enkel
  // in noodgeval" aanduidde, mag je toewijzen, maar dan wil je weten dat je hem
  // straks nog moet bellen.
  const said = await driverAvailability(driverId, booking.startAt, booking.endAt);
  const who = driver?.name ?? 'deze chauffeur';
  const warning =
    said === 'NIETS'
      ? `Let op: ${who} gaf niet op dat hij op dat moment kan rijden.`
      : said === 'LIEVER_NIET'
        ? `Let op: ${who} gaf "liever niet" op voor dat moment.`
        : said === 'NOOD'
          ? `Let op: ${who} gaf op dat hij dan enkel in noodgeval rijdt.`
          : null;
  return {
    ok: true,
    warning: warning !== null,
    message: warning ? `Chauffeur toegewezen. ${warning}` : 'Chauffeur toegewezen.',
  };
}

/**
 * Een rit doorgeven aan een post of werkgroep, die er zelf een chauffeur op zet.
 *
 * Bestaat omdat Logistiek niet voor elke rit een chauffeur heeft, en voor de
 * auto ook niet hoeft: daar rijdt elk lid met een rijbewijs mee. De post die de
 * rit vroeg, weet zelf wie er die avond kan; Logistiek weet dat niet en moet het
 * anders gaan navragen.
 *
 * **Niet voor de kar.** Een voertuig met `needsVanDriver` vraagt een
 * goedgekeurde karchauffeur uit de pool, en dat is een beslissing van Logistiek
 * en niet van de post die iets te vervoeren heeft. De keuzelijst laat het al niet
 * toe; deze controle staat er omdat een keuzelijst geen poort is.
 *
 * De toewijzing vervangt de chauffeur niet: staat er al iemand op, dan blijft
 * die staan en is dit enkel "jullie mogen dit wijzigen".
 */
export async function assignTripGroupAction(
  bookingId: string,
  groupId: string
): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      assignedGroupId: true,
      vehicle: { select: { needsVanDriver: true, nameNl: true } },
    },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'REQUESTED' && booking.status !== 'APPROVED') {
    return { ok: false, error: 'Deze rit is afgerond of geannuleerd; die geef je niet meer door.' };
  }

  const wanted = groupId.trim();
  if (wanted && booking.vehicle.needsVanDriver) {
    return {
      ok: false,
      error: `${booking.vehicle.nameNl} vraagt een goedgekeurde karchauffeur en kan niet aan een post doorgegeven worden.`,
    };
  }

  const group = wanted
    ? await prisma.group.findFirst({ where: { id: wanted, active: true }, select: { id: true, nameNl: true } })
    : null;
  if (wanted && !group) return { ok: false, error: 'Die post of werkgroep bestaat niet meer.' };
  if ((group?.id ?? null) === booking.assignedGroupId) return { ok: true, message: 'Niets gewijzigd.' };

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { assignedGroupId: group?.id ?? null },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'EDITED',
    note: group ? `doorgegeven aan ${group.nameNl}` : 'niet meer doorgegeven aan een post',
    actorId: session.user.id,
  });

  revalidateBeheer();
  revalidatePath('/ritten');
  if (!group) return { ok: true, message: 'De rit staat niet meer bij een post.' };

  // Ná de write, zoals elke mail hier. Vertrekt er niets omdat de post geen
  // verantwoordelijke heeft, dan zegt de melding dat: de toewijzing zelf is
  // gelukt, maar ze bereikt zo niemand, en dat wil je weten voor je verder gaat.
  const note = handoverNote(group.nameNl, await notifyGroupAssignedForTrip(bookingId));
  return { ok: true, warning: note.warning, message: note.message };
}

/** Voertuig wisselen: tarief opnieuw snapshotten en de prijs herberekenen. */
export async function changeVehicleAction(
  bookingId: string,
  vehicleId: string,
  /** Bewust naar een voertuig wisselen dat op dat moment al bezet is. */
  allowOverlap = false
): Promise<ActionResult> {
  const session = await requireManage();

  const outcome = await runSerializable(
    async (
      tx
    ): Promise<{ error: string | null; vehicleName?: string; detail?: string; overlapNote?: string }> => {
      const booking = await tx.uitleenTransportBooking.findUnique({
        where: { id: bookingId },
        include: { payments: { select: { status: true } } },
      });
      if (!booking) return { error: 'NOT_FOUND' as const };
      if (booking.status === 'REJECTED' || booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
        return { error: 'LOCKED' as const };
      }
      if (
        booking.paidOfflineAt ||
        booking.payments.some((payment) =>
          ['CREATED', 'PENDING', 'SUCCEEDED'].includes(payment.status),
        )
      ) {
        return { error: 'PAYMENT_LOCKED' as const };
      }
      const vehicle = await tx.uitleenVehicle.findFirst({ where: { id: vehicleId, active: true } });
      if (!vehicle) return { error: 'NO_VEHICLE' as const };
      // Voor de historiek: wat het was, want "voertuig: Kar" zegt niet wat er
      // veranderde, en de aanvrager leest deze regel (F6.11).
      const before = await tx.uitleenVehicle.findUnique({
        where: { id: booking.vehicleId },
        select: { nameNl: true },
      });

      let overlapNote: string | undefined;
      if (booking.status === 'APPROVED') {
        const clashes = await overlappingBookings(tx, vehicle.id, booking.startAt, booking.endAt, [
          booking.id,
        ]);
        if (clashes.length > 0) {
          if (!allowOverlap) return { error: 'OVERLAP' as const, detail: overlapLabel(clashes) };
          overlapNote = overlapAuditNote(clashes);
        }
      }

      const priceCents =
        booking.status === 'APPROVED'
          ? transportPriceCents({
              pricingMode: vehicle.pricingMode,
              rateCents: vehicle.rateCents,
              startAt: booking.startAt,
              endAt: booking.endAt,
            })
          : null;

      await tx.uitleenTransportBooking.update({
        where: { id: booking.id },
        data: { vehicleId: vehicle.id, pricingMode: vehicle.pricingMode, rateCents: vehicle.rateCents, priceCents },
      });
      await writeAudit(tx, { transportBookingId: booking.id }, {
        kind: 'EDITED',
        note: `Voertuig: ${before?.nameNl ?? 'onbekend'} → ${vehicle.nameNl}`,
        actorId: session.user.id,
      });
      if (overlapNote) {
        await writeAudit(tx, { transportBookingId: booking.id }, {
          kind: 'NOTE',
          note: overlapNote,
          actorId: session.user.id,
        });
      }
      return { error: null, vehicleName: vehicle.nameNl, overlapNote };
    }
  );

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Rit niet gevonden.' };
  if (outcome.error === 'LOCKED') return { ok: false, error: 'Voor deze rit kan je het voertuig niet meer wisselen.' };
  if (outcome.error === 'NO_VEHICLE') return { ok: false, error: 'Voertuig niet gevonden.' };
  if (outcome.error === 'OVERLAP') {
    return {
      ok: false,
      error: `Dat voertuig staat op dat moment al vast: ${outcome.detail}.`,
      code: 'OVERLAP',
    };
  }
  if (outcome.error === 'PAYMENT_LOCKED') {
    return { ok: false, error: 'Deze rit heeft een actieve of voltooide betaling en kan niet meer gewijzigd worden.' };
  }

  await notifyTransport([bookingId], 'EDITED', `Voertuig gewijzigd naar ${outcome.vehicleName}.`, { actorId: session.user.id });
  revalidateBeheer();
  return {
    ok: true,
    warning: Boolean(outcome.overlapNote),
    message: outcome.overlapNote
      ? `Voertuig gewijzigd, maar het staat nu dubbel geboekt (${outcome.overlapNote.replace('bewust ingepland over ', '')}).`
      : 'Voertuig gewijzigd.',
  };
}

/** Rit afronden; voor per-km-voertuigen voer je de kilometers in en wordt de prijs berekend. */
export async function completeTransportAction(bookingId: string, kilometersRaw?: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'APPROVED') {
    return { ok: false, error: 'Enkel een goedgekeurde rit kan afgerond worden.' };
  }

  let kilometers: number | null = booking.kilometers;
  let priceCents: number | null = booking.priceCents;
  if (booking.pricingMode === 'PER_KM') {
    const parsed = Number.parseInt(String(kilometersRaw ?? '').trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'Vul het aantal gereden kilometers in.' };
    }
    kilometers = parsed;
    priceCents = parsed * booking.rateCents;
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      kilometers,
      priceCents,
      completedAt: new Date(),
      completedById: session.user.id,
    },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'APPROVED',
    toStatus: 'COMPLETED',
    note: kilometers !== null ? `${kilometers} km` : null,
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Rit afgerond.' };
}

export async function markTransportPaidOfflineAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.paidOfflineAt) return { ok: false, error: 'Al gemarkeerd als betaald.' };

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { paidOfflineAt: new Date() },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaald aan de balie',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als betaald.' };
}

export async function reopenTransportAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    include: { payments: { select: { status: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'APPROVED' && booking.status !== 'REJECTED') {
    return { ok: false, error: 'Enkel een goedgekeurde of afgewezen rit kan terug op "aangevraagd".' };
  }
  if (booking.paidOfflineAt) {
    return { ok: false, error: 'Draai eerst de betaling terug; daarna kan de goedkeuring terug.' };
  }
  if (booking.payments.some((payment) => BLOCKING_PAYMENT_STATUSES.includes(payment.status))) {
    return { ok: false, error: 'Er loopt een online betaling voor deze rit.' };
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: {
      status: 'REQUESTED',
      paymentMode: null,
      decidedAt: null,
      decidedById: null,
      // Terug naar de prijsindicatie van de aanvraag; per km blijft ze onbekend.
      priceCents: transportPriceCents({
        pricingMode: booking.pricingMode,
        rateCents: booking.rateCents,
        startAt: booking.startAt,
        endAt: booking.endAt,
      }),
    },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: booking.status,
    toStatus: 'REQUESTED',
    note: 'beslissing teruggedraaid',
    actorId: session.user.id,
  });
  await notifyTransport(
    [bookingId],
    'REOPENED',
    booking.status === 'APPROVED'
      ? 'De goedkeuring is ingetrokken; je rit wacht opnieuw op een beslissing.'
      : 'De afwijzing is ingetrokken; je rit wacht opnieuw op een beslissing.',
    { actorId: session.user.id }
  );

  revalidateBeheer();
  return { ok: true, message: 'De rit staat terug op "aangevraagd".' };
}

/**
 * Afronden terugdraaien. De rit wordt weer goedgekeurd en de kilometers gaan
 * leeg: wie een afronding terugdraait, doet dat meestal net omdat de km fout
 * stonden, en dan moet het afrondformulier ze opnieuw vragen.
 */
export async function undoCompleteTransportAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    include: { payments: { select: { status: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'COMPLETED') return { ok: false, error: 'Deze rit is niet afgerond.' };
  if (booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Deze rit is online betaald; terugbetalen loopt via de betaalprovider.',
    };
  }

  const perKm = booking.pricingMode === 'PER_KM';
  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: {
      status: 'APPROVED',
      completedAt: null,
      completedById: null,
      kilometers: perKm ? null : booking.kilometers,
      priceCents: perKm ? null : booking.priceCents,
    },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'COMPLETED',
    toStatus: 'APPROVED',
    note: perKm ? 'afronding teruggedraaid; kilometers gewist' : 'afronding teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De afronding is teruggedraaid.' };
}

export async function undoTransportPaidOfflineAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    include: { payments: { select: { status: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (!booking.paidOfflineAt) return { ok: false, error: 'Deze rit staat niet als betaald.' };
  if (booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Er is online betaald; terugbetalen loopt via de betaalprovider, niet via dit scherm.',
    };
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { paidOfflineAt: null },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaling aan de balie teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De rit staat weer als niet betaald.' };
}
