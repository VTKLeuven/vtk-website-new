'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireSession } from '@/lib/session';
import {
  isEmailish,
  isOnQuarterHour,
  parseDateOnly,
  todayDateOnly,
  transportPriceCents,
} from '@/lib/uitleen';
import { availabilityForRange } from '@/lib/uitleen-server';
import {
  buildReservationData,
  parseBrusselsDateTime,
  MAX_NOTE_LENGTH,
  type ReservationFormInput,
} from '@/lib/reservation-form';
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

export async function createReservationAction(input: ReservationFormInput): Promise<ActionResult> {
  const session = await requireSession();
  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, flesserkeLines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  await prisma.uitleenReservation.create({
    data: { userId: session.user.id, ...built.scalars, lines: { create: built.lineCreates } },
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

  await prisma.uitleenReservation.create({
    data: { userId: session.user.id, ...built.scalars, flesserkeLines: { create: built.flesserkeLineCreates } },
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

/**
 * Bovengrens tegen tikfouten, geen beleid. Er stond ooit 12 uur op, maar een
 * praesidiumweekend of een karroadtrip duurt langer; die aanvragen werden zo
 * naar de mail geduwd. Dit vangt enkel nog een verkeerd getypt jaartal.
 */
const MAX_VAN_BOOKING_DAYS = 30;

/**
 * Eén tijdvenster van een rit, gevalideerd. `label` komt in de foutmelding
 * terecht, zodat je bij een heen-en-terugaanvraag weet welke helft fout staat.
 */
function parseTripWindow(
  startRaw: string,
  endRaw: string,
  label: string
): { ok: true; startAt: Date; endAt: Date } | { ok: false; error: string } {
  const startAt = parseBrusselsDateTime(startRaw);
  const endAt = parseBrusselsDateTime(endRaw);
  if (!startAt || !endAt) return { ok: false, error: `Kies een start- en eindmoment${label}.` };
  if (startAt <= new Date()) return { ok: false, error: `Het startmoment${label} ligt in het verleden.` };
  if (endAt <= startAt) {
    return { ok: false, error: `Het eindmoment${label} ligt voor het startmoment.` };
  }
  if (!isOnQuarterHour(startAt) || !isOnQuarterHour(endAt)) {
    return {
      ok: false,
      error: `Kies een begin- en einduur op het kwartier (bv. 14:00, 14:15)${label}.`,
    };
  }
  const days = (endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_VAN_BOOKING_DAYS) {
    return {
      ok: false,
      error: `Een rit kan maximaal ${MAX_VAN_BOOKING_DAYS} dagen duren; controleer de datums${label}.`,
    };
  }
  return { ok: true, startAt, endAt };
}

export async function createVanBookingAction(input: {
  startAt: string; // datetime-local, Belgische wall-clock
  endAt: string;
  purpose: string;
  pickupAddress: string;
  destination: string;
  note: string;
  /** Eén of meer voertuigen; `vehicleId` blijft aanvaard voor één voertuig. */
  vehicleIds?: string[];
  vehicleId?: string;
  eventName?: string;
  helpersNote?: string;
  helpersPhone?: string;
  contactPhone?: string;
  /** Meelezend adres, zoals op een materiaalaanvraag. */
  notifyEmail?: string;
  /** Tweede tijdvenster: dan wordt dit een heen-en-terugaanvraag (twee ritten). */
  returnStartAt?: string;
  returnEndAt?: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  const wantsReturn = Boolean(input.returnStartAt && input.returnEndAt);
  const outbound = parseTripWindow(input.startAt, input.endAt, wantsReturn ? ' van de heenrit' : '');
  if (!outbound.ok) return { ok: false, error: outbound.error };
  const { startAt, endAt } = outbound;

  let inbound: { startAt: Date; endAt: Date } | null = null;
  if (wantsReturn) {
    const parsed = parseTripWindow(input.returnStartAt!, input.returnEndAt!, ' van de terugrit');
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.startAt < endAt) {
      return { ok: false, error: 'De terugrit start voor de heenrit gedaan is.' };
    }
    inbound = { startAt: parsed.startAt, endAt: parsed.endAt };
  }

  const purpose = input.purpose.trim();
  if (!purpose) return { ok: false, error: 'Beschrijf waarvoor je het voertuig nodig hebt.' };

  const notifyEmail = input.notifyEmail?.trim() ?? '';
  if (notifyEmail && !isEmailish(notifyEmail)) {
    return { ok: false, error: 'Het extra e-mailadres ziet er niet uit als een adres.' };
  }

  // Eén of meerdere voertuigen: een verhuis met de kar én de auto is één vraag,
  // en die als twee aanvragen laten indienen betekent dat het team ze ook los kan
  // beslissen. Ze delen daarom één `tripGroupId`, net als heen en terug (V12).
  const chosenIds = (input.vehicleIds ?? (input.vehicleId ? [input.vehicleId] : [])).filter(Boolean);
  const vehicles = chosenIds.length
    ? await prisma.uitleenVehicle.findMany({ where: { id: { in: chosenIds }, active: true } })
    : await prisma.uitleenVehicle
        .findFirst({ where: { active: true }, orderBy: { sortIndex: 'asc' } })
        .then((found) => (found ? [found] : []));
  if (vehicles.length === 0) return { ok: false, error: 'Kies een voertuig.' };
  if (vehicles.length !== new Set(chosenIds).size && chosenIds.length > 0) {
    return { ok: false, error: 'Een van de gekozen voertuigen bestaat niet meer; herlaad de pagina.' };
  }

  // Gedeelde velden van elke boeking; voertuig, tarief en tijdvenster verschillen.
  const shared = {
    userId: session.user.id,
    purpose: purpose.slice(0, MAX_NOTE_LENGTH),
    eventName: input.eventName?.trim().slice(0, 300) || null,
    pickupAddress: input.pickupAddress.trim().slice(0, 300) || null,
    destination: input.destination.trim().slice(0, 300) || null,
    helpersNote: input.helpersNote?.trim().slice(0, 300) || null,
    helpersPhone: input.helpersPhone?.trim().slice(0, 60) || null,
    contactPhone: input.contactPhone?.trim().slice(0, 60) || null,
    notifyEmail: notifyEmail.slice(0, 300) || null,
    memberNote: input.note.trim().slice(0, MAX_NOTE_LENGTH) || null,
  };
  /** Tarief per voertuig gesnapshot; per km blijft de prijs null tot na de rit. */
  const bookingFor = (
    vehicle: (typeof vehicles)[number],
    from: Date,
    to: Date,
    leg: 'HEEN' | 'TERUG' | null,
    tripGroupId: string | null
  ) => ({
    ...shared,
    vehicleId: vehicle.id,
    pricingMode: vehicle.pricingMode,
    rateCents: vehicle.rateCents,
    tripGroupId,
    tripLeg: leg,
    startAt: from,
    endAt: to,
    priceCents: transportPriceCents({
      pricingMode: vehicle.pricingMode,
      rateCents: vehicle.rateCents,
      startAt: from,
      endAt: to,
    }),
  });

  // Eén boeking per voertuig en per rit. Ze horen bij elkaar zodra het er meer dan
  // één is: het team beslist, annuleert en verschuift ze in hun geheel. Bij één
  // enkele rit met één voertuig blijft `tripGroupId` null, zoals voordien.
  const legs: Array<{ from: Date; to: Date; leg: 'HEEN' | 'TERUG' | null }> = inbound
    ? [
        { from: startAt, to: endAt, leg: 'HEEN' },
        { from: inbound.startAt, to: inbound.endAt, leg: 'TERUG' },
      ]
    : [{ from: startAt, to: endAt, leg: null }];
  const grouped = vehicles.length > 1 || legs.length > 1;
  const tripGroupId = grouped ? randomUUID() : null;

  await prisma.uitleenTransportBooking.createMany({
    data: vehicles.flatMap((vehicle) =>
      legs.map((leg) => bookingFor(vehicle, leg.from, leg.to, leg.leg, tripGroupId))
    ),
  });

  revalidateMember();
  const what =
    vehicles.length > 1
      ? `${vehicles.length} voertuigen aangevraagd`
      : inbound
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
      eventName: target === 'reservation' ? 'VTK uitleendienst' : 'VTK vervoer',
      currency: 'EUR',
      lines: [
        {
          name: target === 'reservation' ? 'Huur materiaal' : 'Vervoer',
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
