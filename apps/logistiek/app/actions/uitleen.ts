'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireSession } from '@/lib/session';
import { isEmailish, parseDateOnly, todayDateOnly } from '@/lib/uitleen';
import { availabilityForRange } from '@/lib/uitleen-server';
import {
  buildReservationData,
  parseBrusselsDateTime,
  MAX_NOTE_LENGTH,
  type ReservationFormInput,
} from '@/lib/reservation-form';
import { buildTransportBookings, type TransportFormInput } from '@/lib/transport-form';
import { expireOpenPayments, logistiekBaseUrl, paymentGateway } from '@/lib/payments';
import { runSerializable } from '@/lib/tx';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
// `ReservationFormInput` NIET her-exporteren vanuit dit `'use server'`-bestand:
// Turbopack behandelt elke export van een use-server-module als een server action,
// en een her-geëxporteerde type-binding laat de build falen ("export doesn't exist
// in target module"). Consumers importeren het type rechtstreeks uit
// `@/lib/reservation-form`.

function revalidateMember() {
  revalidatePath('/reservaties');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
}

type SessionLike = { user: { id: string; name: string }; groups: Array<{ id: string }> };

/**
 * Leidt het aanvragertype automatisch af uit de gekozen groep in de login. Een
 * praesidiumpost wordt INTERN; een werkgroep behoudt het aparte WERKGROEP-type;
 * wie geen groep heeft vraagt EXTERN aan met de eigen naam.
 *
 * `requestsAsExternal` in lib/session.ts volgt dezelfde regel, maar dan vooraf:
 * wie extern aanvraagt, krijgt de evenementen en sjablonen niet te zien.
 */
async function deriveMemberRequester(
  session: SessionLike,
  chosenGroupId?: string
): Promise<{
  requesterType: 'INTERN' | 'WERKGROEP' | 'EXTERN';
  groupId: string | null;
  requesterName?: string;
}> {
  if (session.groups.length > 0) {
    const groupId = session.groups.some((g) => g.id === chosenGroupId)
      ? chosenGroupId!
      : session.groups[0].id;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      select: { type: true, nameNl: true },
    });
    if (!group) return { requesterType: 'EXTERN', groupId: null, requesterName: session.user.name };
    if (group.type === 'WERKGROEP') {
      return { requesterType: 'WERKGROEP', groupId: null, requesterName: group.nameNl };
    }
    return { requesterType: 'INTERN', groupId, requesterName: undefined };
  }
  return { requesterType: 'EXTERN', groupId: null, requesterName: session.user.name };
}

/**
 * Het evenement waaraan deze aanvraag hangt, of null.
 *
 * `eventId` is wat het lid koos; `createEvent` betekent "maak er een van met de
 * gegevens die ik net invulde", zodat de volgende aanvraag (het vervoer) eraan
 * kan hangen zonder op het team te wachten. Een onbekend id negeren we stil: dan
 * is het evenement intussen verwijderd, en de aanvraag zelf is belangrijker.
 */
async function resolveEventId(
  session: SessionLike,
  input: {
    eventId?: string | null;
    createEvent?: boolean;
    eventName?: string;
    eventLocation?: string;
    eventStart?: string;
  },
  groupId: string | null
): Promise<string | null> {
  const chosen = (input.eventId ?? '').trim();
  if (chosen) {
    const found = await prisma.uitleenEvent.findUnique({
      where: { id: chosen },
      select: { id: true },
    });
    return found?.id ?? null;
  }
  if (!input.createEvent) return null;

  const name = (input.eventName ?? '').trim();
  if (!name) return null;
  const created = await prisma.uitleenEvent.create({
    data: {
      name: name.slice(0, 200),
      location: (input.eventLocation ?? '').trim().slice(0, 300) || null,
      startAt: input.eventStart ? parseBrusselsDateTime(input.eventStart) : null,
      groupId,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  return created.id;
}

export async function createReservationAction(input: ReservationFormInput): Promise<ActionResult> {
  const session = await requireSession();
  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, flesserkeLines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  const eventId = await resolveEventId(session, input, built.scalars.groupId);
  await prisma.uitleenReservation.create({
    data: {
      userId: session.user.id,
      ...built.scalars,
      eventId,
      lines: { create: built.lineCreates },
    },
  });

  revalidateMember();
  return { ok: true, message: 'Aanvraag ingediend. Je vindt de status bij Mijn aanvragen.' };
}

/** Een lid mag zijn eigen materiaalaanvraag bewerken zolang ze nog niet beslist is. */
export async function editReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  const session = await requireSession();

  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, flesserkeLines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  // Statusguard en writes horen bij elkaar: een gelijktijdige goedkeuring mag
  // nooit gevolgd worden door een ongecontroleerde ledenedit.
  const outcome = await runSerializable(async (tx) => {
    const existing = await tx.uitleenReservation.findFirst({
      where: { id: reservationId, userId: session.user.id },
      select: { status: true },
    });
    if (!existing) return 'NOT_FOUND' as const;
    if (existing.status !== 'REQUESTED') return 'LOCKED' as const;
    await tx.uitleenReservationLine.deleteMany({ where: { reservationId } });
    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: { ...built.scalars, lines: { create: built.lineCreates } },
    });
    return 'OK' as const;
  });
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome === 'LOCKED') {
    return { ok: false, error: 'Deze aanvraag is al beslist; bewerken kan niet meer. Neem contact op met Logistiek.' };
  }

  revalidateMember();
  return { ok: true, message: 'Aanvraag bijgewerkt.' };
}

function revalidateFlesserke() {
  revalidatePath('/reservaties');
  revalidatePath('/flesserke');
}

/**
 * Flesserke-aanvraag: aparte reservatie met enkel flesserke-lijnen. Voor de
 * interne werking, dus elk lid van een post, werkgroep of jaarwerking
 * (`FLESSERKE_REQUESTER_TYPES`); externen kunnen dit niet aanvragen.
 */
export async function createFlesserkeReservationAction(input: ReservationFormInput): Promise<ActionResult> {
  const session = await requireSession();
  if (session.groups.length === 0) {
    return { ok: false, error: 'Flesserke is enkel voor de interne werking van VTK.' };
  }
  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, lines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  const eventId = await resolveEventId(session, input, built.scalars.groupId);
  await prisma.uitleenReservation.create({
    data: {
      userId: session.user.id,
      ...built.scalars,
      eventId,
      flesserkeLines: { create: built.flesserkeLineCreates },
    },
  });

  revalidateFlesserke();
  return { ok: true, message: 'Flesserke-aanvraag ingediend. Je krijgt bericht zodra Logistiek beslist.' };
}

export async function editFlesserkeReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  const session = await requireSession();
  if (session.groups.length === 0) {
    return { ok: false, error: 'Flesserke is enkel voor de interne werking van VTK.' };
  }

  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, lines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  const outcome = await runSerializable(async (tx) => {
    const existing = await tx.uitleenReservation.findFirst({
      where: { id: reservationId, userId: session.user.id },
      select: { status: true },
    });
    if (!existing) return 'NOT_FOUND' as const;
    if (existing.status !== 'REQUESTED') return 'LOCKED' as const;
    await tx.uitleenFlesserkeLine.deleteMany({ where: { reservationId } });
    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: { ...built.scalars, flesserkeLines: { create: built.flesserkeLineCreates } },
    });
    return 'OK' as const;
  });
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'Aanvraag niet gevonden.' };
  if (outcome === 'LOCKED') {
    return { ok: false, error: 'Deze aanvraag is al beslist; bewerken kan niet meer.' };
  }

  revalidateFlesserke();
  return { ok: true, message: 'Flesserke-aanvraag bijgewerkt.' };
}

/**
 * Een sjabloon maken van wat er nu in het aanvraagformulier staat (M5).
 *
 * Elk lid mag dit, niet enkel Logistiek: de posten vroegen er zelf om, en het
 * oude argument (na één jaar dertig varianten van "cantus") gaat over de
 * keuzelijst en niet over wie mag aanmaken. De rem zit dan ook in de UI en niet
 * in de rechten: "Nieuw sjabloon" staat onderaan de keuzelijst met de bestaande
 * sjablonen, zodat je er eerst langs moet.
 *
 * De post is een label, geen filter: iedereen ziet elk sjabloon (zie
 * `requestTemplates`). Hij komt uit de groep waarnamens je aanvraagt, en enkel
 * als je daar echt bij hoort.
 */
export async function createTemplateFromSelectionAction(input: {
  name: string;
  description?: string;
  groupId?: string | null;
  lines: Array<{ itemId: string; quantity: number }>;
}): Promise<ActionResult> {
  const session = await requireSession();

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Geef het sjabloon een naam.' };

  // Twee keer hetzelfde item in één sjabloon botst op de unieke index; optellen
  // geeft een nette lijst in plaats van een databasefout.
  const totals = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue;
    totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity);
  }
  if (totals.size === 0) {
    return { ok: false, error: 'Kies eerst materiaal; een leeg sjabloon heeft geen nut.' };
  }

  // Enkel bestaand, actief materiaal: een sjabloon dat naar een verwijderd item
  // wijst, zou bij elk gebruik stilzwijgend een lijn overslaan.
  const items = await prisma.uitleenItem.findMany({
    where: { id: { in: [...totals.keys()] }, active: true },
    select: { id: true },
  });
  const known = new Set(items.map((item) => item.id));
  const lines = [...totals.entries()].filter(([itemId]) => known.has(itemId));
  if (lines.length === 0) {
    return { ok: false, error: 'Geen van de gekozen items staat nog in de catalogus.' };
  }

  const groupId =
    input.groupId && session.groups.some((group) => group.id === input.groupId)
      ? input.groupId
      : null;

  const existing = await prisma.uitleenRequestTemplate.findFirst({
    where: { name, active: true },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `Er bestaat al een sjabloon met de naam "${name}". Kies een andere naam, of gebruik het bestaande.`,
    };
  }

  await prisma.uitleenRequestTemplate.create({
    data: {
      name: name.slice(0, 120),
      description: (input.description ?? '').trim().slice(0, 300) || null,
      groupId,
      createdById: session.user.id,
      lines: { create: lines.map(([itemId, quantity]) => ({ itemId, quantity })) },
    },
  });

  revalidatePath('/materiaal');
  revalidatePath('/beheer/sjablonen');
  return { ok: true, message: `Sjabloon "${name}" bewaard. Iedereen kan het nu kiezen.` };
}

/**
 * De basisgegevens van je eigen evenement bijwerken (E1).
 *
 * Wat de aanvrager mag wijzigen, is wat hij zelf het best weet: waar het
 * doorgaat, wanneer het begint en eindigt, en hoeveel volk er komt. De nota
 * blijft van het team ("materiaal blijft staan tot maandag") en de naam blijft
 * staan, want daar hangen de aanvragen met hun eigen momentopname aan.
 *
 * Enkel voor een evenement van je eigen post of werkgroep, of een dat je zelf
 * aanmaakte; dezelfde grens als `memberEvents`.
 */
export async function saveMemberEventAction(input: {
  eventId: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  expectedAttendance: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const groupIds = session.groups.map((group) => group.id);

  const event = await prisma.uitleenEvent.findFirst({
    where: {
      id: input.eventId,
      OR: [
        ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
        { createdById: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (!event) return { ok: false, error: 'Dit evenement is niet van jou.' };

  const startAt = input.startDate
    ? parseBrusselsDateTime(`${input.startDate}T${input.startTime || '00:00'}`)
    : null;
  if (input.startDate && !startAt) return { ok: false, error: 'De startdag is ongeldig.' };
  const endAt = input.endDate
    ? parseBrusselsDateTime(`${input.endDate}T${input.endTime || '23:59'}`)
    : null;
  if (input.endDate && !endAt) return { ok: false, error: 'De einddag is ongeldig.' };
  if (startAt && endAt && endAt < startAt) {
    return { ok: false, error: 'Het einde ligt voor het begin.' };
  }

  const attendanceRaw = input.expectedAttendance.trim();
  const attendance = attendanceRaw ? Number(attendanceRaw) : null;
  if (attendance !== null && (!Number.isInteger(attendance) || attendance < 0)) {
    return { ok: false, error: 'De verwachte opkomst moet een getal zijn.' };
  }

  await prisma.uitleenEvent.update({
    where: { id: event.id },
    data: {
      location: input.location.trim().slice(0, 300) || null,
      startAt,
      startTimeKnown: Boolean(input.startDate && input.startTime),
      endAt,
      expectedAttendance: attendance,
    },
  });

  revalidatePath('/evenementen');
  revalidatePath(`/evenementen/${event.id}`);
  revalidatePath('/beheer/evenementen');
  return { ok: true, message: 'Evenement bijgewerkt.' };
}

export async function cancelReservationAction(reservationId: string): Promise<ActionResult> {
  const session = await requireSession();

  const reservation = await prisma.uitleenReservation.findFirst({
    where: { id: reservationId, userId: session.user.id },
    include: { payments: true },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'REQUESTED' && reservation.status !== 'APPROVED') {
    return { ok: false, error: 'Deze reservatie kan je niet meer annuleren.' };
  }
  if (reservation.payments.length > 0) {
    if (!reservation.payments.some((payment) => payment.status === 'SUCCEEDED')) {
      const expired = await expireOpenPayments(reservation.payments);
      if (!expired.ok) return { ok: false, error: expired.error };
    }
  }
  if (reservation.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Deze reservatie is al betaald; mail logistiek@vtk.be om ze te annuleren.',
    };
  }

  const cancelled = await prisma.uitleenReservation.updateMany({
    where: {
      id: reservation.id,
      userId: session.user.id,
      status: { in: ['REQUESTED', 'APPROVED'] },
      payments: { none: { status: 'SUCCEEDED' } },
    },
    data: { status: 'CANCELLED' },
  });
  if (cancelled.count === 0) {
    return { ok: false, error: 'Deze reservatie kan niet meer veilig geannuleerd worden.' };
  }

  revalidateMember();
  return { ok: true, message: 'Reservatie geannuleerd.' };
}

/** Live beschikbaarheid voor de gekozen periode (zachte indicatie in de catalogus). */
export async function checkAvailabilityAction(input: {
  pickupDate: string;
  returnDate: string;
}): Promise<{ ok: true; availability: Array<{ itemId: string; available: number }> } | { ok: false }> {
  await requireSession();
  const pickupDate = parseDateOnly(input.pickupDate);
  const returnDate = parseDateOnly(input.returnDate);
  if (!pickupDate || !returnDate || returnDate < pickupDate) return { ok: false };
  return { ok: true, availability: await availabilityForRange(pickupDate, returnDate) };
}

export async function createVanBookingAction(input: TransportFormInput & {
  /** Koepel-evenement (A8), of `createEvent` om er een te maken van `eventName`. */
  eventId?: string | null;
  createEvent?: boolean;
  /** Post of werkgroep waarvoor de rit dient; leeg = de eerste van het lid. */
  groupId?: string | null;
}): Promise<ActionResult> {
  const session = await requireSession();

  // Zoals bij een materiaalaanvraag: de rit hangt aan de post waarvoor ze dient.
  // Dat stond hier niet, waardoor elke rit van een lid als "Interne post" zonder
  // naam in het beheer stond en de post ze onderling niet kon zien.
  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const eventId = await resolveEventId(session, { ...input, eventStart: undefined }, requester.groupId);
  const built = await buildTransportBookings(input, {
    userId: session.user.id,
    eventId,
    requesterType: requester.requesterType,
    groupId: requester.groupId,
    requesterName: requester.requesterName ?? null,
  });
  if (!built.ok) return { ok: false, error: built.error };

  await prisma.uitleenTransportBooking.createMany({ data: built.bookings });

  revalidateMember();
  const what =
    built.vehicleCount > 1
      ? `${built.vehicleCount} voertuigen aangevraagd`
      : built.roundTrip
        ? 'Heen- en terugrit aangevraagd'
        : 'Rit aangevraagd';
  return { ok: true, message: `${what}. Je vindt de status bij Mijn aanvragen.` };
}

export async function cancelVanBookingAction(bookingId: string): Promise<ActionResult> {
  const session = await requireSession();

  const booking = await prisma.uitleenTransportBooking.findFirst({
    where: { id: bookingId, userId: session.user.id },
    include: { payments: true },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'REQUESTED' && booking.status !== 'APPROVED') {
    return { ok: false, error: 'Deze rit kan je niet meer annuleren.' };
  }
  if (booking.payments.length > 0 && !booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    const expired = await expireOpenPayments(booking.payments);
    if (!expired.ok) return { ok: false, error: expired.error };
  }
  if (booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return { ok: false, error: 'Deze rit is al betaald; mail logistiek@vtk.be om ze te annuleren.' };
  }

  // Een heen-en-terugaanvraag annuleer je in haar geheel: enkel de heenrit
  // annuleren laat een terugrit staan die niemand meer gaat rijden.
  const cancelled = await prisma.uitleenTransportBooking.updateMany({
    where: {
      ...(booking.tripGroupId ? { tripGroupId: booking.tripGroupId } : { id: booking.id }),
      userId: session.user.id,
      status: { in: ['REQUESTED', 'APPROVED'] },
      payments: { none: { status: 'SUCCEEDED' } },
    },
    data: { status: 'CANCELLED' },
  });
  if (cancelled.count === 0) {
    return { ok: false, error: 'Deze rit kan niet meer veilig geannuleerd worden.' };
  }

  revalidateMember();
  return {
    ok: true,
    message: cancelled.count > 1 ? 'Heen- en terugrit geannuleerd.' : 'Rit geannuleerd.',
  };
}

// ---------------------------------------------------------------------------
// Online betalen
// ---------------------------------------------------------------------------

export type StartPaymentResult = { ok: true; url: string } | { ok: false; error: string };

const CHECKOUT_MINUTES = 30;

/**
 * Start een online betaling voor een goedgekeurde reservatie of rit en geeft de
 * checkout-URL van de provider terug; de client stuurt de browser erheen.
 * Enkel de huurprijs wordt online betaald; de waarborg blijft cash bij afhaling.
 */
export async function startPaymentAction(
  target: 'reservation' | 'van',
  id: string
): Promise<StartPaymentResult> {
  const session = await requireSession();

  const record =
    target === 'reservation'
      ? await prisma.uitleenReservation.findFirst({
          where: { id, userId: session.user.id },
          include: { payments: true },
        })
      : await prisma.uitleenTransportBooking.findFirst({
          where: { id, userId: session.user.id },
          include: { payments: true },
        });

  if (!record) return { ok: false, error: 'Niet gevonden.' };
  const payableStatus =
    record.status === 'APPROVED' ||
    (target === 'van' && record.status === 'COMPLETED');
  if (!payableStatus) {
    return { ok: false, error: 'Betalen kan pas nadat de aanvraag goedgekeurd is.' };
  }
  if (record.paymentMode !== 'ONLINE') {
    return { ok: false, error: 'Deze reservatie betaal je ter plaatse, niet online.' };
  }
  if (record.paidOfflineAt || record.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return { ok: false, error: 'Al betaald.' };
  }
  const amountCents =
    target === 'reservation'
      ? (record as { totalPriceCents: number }).totalPriceCents
      : (record as { priceCents: number }).priceCents;
  if (amountCents <= 0) return { ok: false, error: 'Er valt niets online te betalen.' };

  // Een nog lopende checkout hergebruiken we in plaats van er een tweede te starten.
  const pending = record.payments.find(
    (payment) =>
      (payment.status === 'CREATED' || payment.status === 'PENDING') &&
      (!payment.expiresAt || payment.expiresAt > new Date())
  );
  if (pending?.checkoutUrl) return { ok: true, url: pending.checkoutUrl };
  if (pending) {
    return { ok: false, error: 'Je betaling wordt klaargezet. Probeer over enkele seconden opnieuw.' };
  }

  const gateway = paymentGateway();
  const attempt = record.payments.length + 1;
  const idempotencyKey = `${target === 'reservation' ? 'res' : 'van'}:${record.id}:${attempt}`;
  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60 * 1000);
  const base = logistiekBaseUrl();
  const detailPath = target === 'reservation' ? `/reservaties/${record.id}` : `/vervoer/${record.id}`;

  let payment;
  try {
    payment = await prisma.uitleenPayment.create({
      data: {
        reservationId: target === 'reservation' ? record.id : null,
        transportBookingId: target === 'van' ? record.id : null,
        provider: gateway.name,
        idempotencyKey,
        amountCents,
        expiresAt,
      },
    });
  } catch (error) {
    // Twee gelijktijdige klikken gebruiken dezelfde attempt/idempotency key. De
    // winnaar maakt de checkout; de andere request maakt nooit een tweede aan.
    const concurrent = await prisma.uitleenPayment.findUnique({
      where: { provider_idempotencyKey: { provider: gateway.name, idempotencyKey } },
    });
    if (concurrent?.checkoutUrl) return { ok: true, url: concurrent.checkoutUrl };
    if (concurrent) {
      return { ok: false, error: 'Je betaling wordt klaargezet. Probeer over enkele seconden opnieuw.' };
    }
    throw error;
  }

  try {
    const checkout = await gateway.createCheckout({
      orderId: record.id,
      orderNumber: record.id.slice(-8).toUpperCase(),
      buyerEmail: session.user.email,
      eventName: target === 'reservation' ? 'VTK uitleendienst' : 'VTK transport',
      currency: 'EUR',
      lines: [
        {
          name: target === 'reservation' ? 'Huur materiaal' : 'Transport',
          quantity: 1,
          unitAmountCents: amountCents,
        },
      ],
      expiresAt,
      successUrl: `${base}${detailPath}?betaling=1`,
      cancelUrl: `${base}${detailPath}`,
      attempt,
    });

    await prisma.uitleenPayment.update({
      where: { id: payment.id },
      data: {
        providerCheckoutId: checkout.checkoutId,
        providerPaymentId: checkout.paymentId ?? null,
        checkoutUrl: checkout.url,
        status: checkout.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING',
        succeededAt: checkout.status === 'SUCCEEDED' ? new Date() : null,
      },
    });

    return { ok: true, url: checkout.url };
  } catch {
    await prisma.uitleenPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: new Date() },
    });
    return { ok: false, error: 'De betaalprovider is niet bereikbaar. Probeer straks opnieuw.' };
  }
}
