'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireSession } from '@/lib/session';
import { parseDateOnly, todayDateOnly, transportPriceCents } from '@/lib/uitleen';
import { availabilityForRange } from '@/lib/uitleen-server';
import {
  buildReservationData,
  parseBrusselsDateTime,
  MAX_NOTE_LENGTH,
  type ReservationFormInput,
} from '@/lib/reservation-form';
import { logistiekBaseUrl, paymentGateway } from '@/lib/payments';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
export type { ReservationFormInput };

function revalidateMember() {
  revalidatePath('/reservaties');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
}

type SessionLike = { user: { id: string; name: string }; groups: Array<{ id: string }> };

/**
 * Leidt het aanvragertype automatisch af uit de login: een praesidiumlid (in een
 * post) vraagt aan als INTERN namens die post; wie geen post heeft, is EXTERN met
 * de eigen naam. Het lid kiest dit dus nooit zelf; de client-waarde wordt
 * genegeerd. (Werkgroepen zitten niet in de DB en worden hier niet afgeleid.)
 */
function deriveMemberRequester(
  session: SessionLike,
  chosenGroupId?: string
): { requesterType: 'INTERN' | 'EXTERN'; groupId: string | null; requesterName?: string } {
  if (session.groups.length > 0) {
    const groupId = session.groups.some((g) => g.id === chosenGroupId)
      ? chosenGroupId!
      : session.groups[0].id;
    return { requesterType: 'INTERN', groupId, requesterName: undefined };
  }
  return { requesterType: 'EXTERN', groupId: null, requesterName: session.user.name };
}

export async function createReservationAction(input: ReservationFormInput): Promise<ActionResult> {
  const session = await requireSession();
  const requester = deriveMemberRequester(session, input.groupId ?? undefined);
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

  const existing = await prisma.uitleenReservation.findFirst({
    where: { id: reservationId, userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (existing.status !== 'REQUESTED') {
    return { ok: false, error: 'Deze aanvraag is al beslist; bewerken kan niet meer. Neem contact op met Logistiek.' };
  }

  const requester = deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, flesserkeLines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  // Enkel de materiaallijnen vervangen; flesserke loopt via een aparte flow.
  await prisma.$transaction([
    prisma.uitleenReservationLine.deleteMany({ where: { reservationId } }),
    prisma.uitleenReservation.update({
      where: { id: reservationId },
      data: { ...built.scalars, lines: { create: built.lineCreates } },
    }),
  ]);

  revalidateMember();
  return { ok: true, message: 'Aanvraag bijgewerkt.' };
}

function revalidateFlesserke() {
  revalidatePath('/reservaties');
  revalidatePath('/flesserke');
}

/** Flesserke-aanvraag (enkel praesidium). Aparte reservatie met enkel flesserke-lijnen. */
export async function createFlesserkeReservationAction(input: ReservationFormInput): Promise<ActionResult> {
  const session = await requireSession();
  if (session.groups.length === 0) {
    return { ok: false, error: 'Flesserke is enkel voor het praesidium.' };
  }
  const requester = deriveMemberRequester(session, input.groupId ?? undefined);
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
  if (session.groups.length === 0) return { ok: false, error: 'Flesserke is enkel voor het praesidium.' };

  const existing = await prisma.uitleenReservation.findFirst({
    where: { id: reservationId, userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: 'Aanvraag niet gevonden.' };
  if (existing.status !== 'REQUESTED') {
    return { ok: false, error: 'Deze aanvraag is al beslist; bewerken kan niet meer.' };
  }

  const requester = deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, lines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  await prisma.$transaction([
    prisma.uitleenFlesserkeLine.deleteMany({ where: { reservationId } }),
    prisma.uitleenReservation.update({
      where: { id: reservationId },
      data: { ...built.scalars, flesserkeLines: { create: built.flesserkeLineCreates } },
    }),
  ]);

  revalidateFlesserke();
  return { ok: true, message: 'Flesserke-aanvraag bijgewerkt.' };
}

export async function cancelReservationAction(reservationId: string): Promise<ActionResult> {
  const session = await requireSession();

  const reservation = await prisma.uitleenReservation.findFirst({
    where: { id: reservationId, userId: session.user.id },
    include: { payments: { where: { status: 'SUCCEEDED' }, select: { id: true } } },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'REQUESTED' && reservation.status !== 'APPROVED') {
    return { ok: false, error: 'Deze reservatie kan je niet meer annuleren.' };
  }
  if (reservation.payments.length > 0) {
    return {
      ok: false,
      error: 'Deze reservatie is al betaald; mail logistiek@vtk.be om ze te annuleren.',
    };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservation.id },
    data: { status: 'CANCELLED' },
  });

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

const MAX_VAN_BOOKING_HOURS = 12;

export async function createVanBookingAction(input: {
  startAt: string; // datetime-local, Belgische wall-clock
  endAt: string;
  purpose: string;
  pickupAddress: string;
  destination: string;
  note: string;
  vehicleId?: string;
  eventName?: string;
  helpersNote?: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  const startAt = parseBrusselsDateTime(input.startAt);
  const endAt = parseBrusselsDateTime(input.endAt);
  if (!startAt || !endAt) return { ok: false, error: 'Kies een start- en eindmoment.' };
  if (startAt <= new Date()) return { ok: false, error: 'Het startmoment ligt in het verleden.' };
  if (endAt <= startAt) return { ok: false, error: 'Het eindmoment ligt voor het startmoment.' };
  const hours = (endAt.getTime() - startAt.getTime()) / (60 * 60 * 1000);
  if (hours > MAX_VAN_BOOKING_HOURS) {
    return {
      ok: false,
      error: `Een rit kan maximaal ${MAX_VAN_BOOKING_HOURS} uur duren; mail logistiek@vtk.be voor langere ritten.`,
    };
  }

  const purpose = input.purpose.trim();
  if (!purpose) return { ok: false, error: 'Beschrijf waarvoor je het voertuig nodig hebt.' };

  const vehicle = input.vehicleId
    ? await prisma.uitleenVehicle.findFirst({ where: { id: input.vehicleId, active: true } })
    : await prisma.uitleenVehicle.findFirst({ where: { active: true }, orderBy: { sortIndex: 'asc' } });
  if (!vehicle) return { ok: false, error: 'Kies een voertuig.' };

  // Tarief snapshotten; prijs is null wanneer ze pas na de rit gekend is (per km).
  const priceCents = transportPriceCents({
    pricingMode: vehicle.pricingMode,
    rateCents: vehicle.rateCents,
    startAt,
    endAt,
  });

  await prisma.uitleenTransportBooking.create({
    data: {
      userId: session.user.id,
      vehicleId: vehicle.id,
      startAt,
      endAt,
      purpose: purpose.slice(0, MAX_NOTE_LENGTH),
      eventName: input.eventName?.trim().slice(0, 300) || null,
      pickupAddress: input.pickupAddress.trim().slice(0, 300) || null,
      destination: input.destination.trim().slice(0, 300) || null,
      helpersNote: input.helpersNote?.trim().slice(0, 300) || null,
      memberNote: input.note.trim().slice(0, MAX_NOTE_LENGTH) || null,
      pricingMode: vehicle.pricingMode,
      rateCents: vehicle.rateCents,
      priceCents,
    },
  });

  revalidateMember();
  return { ok: true, message: 'Rit aangevraagd. Je vindt de status bij Mijn aanvragen.' };
}

export async function cancelVanBookingAction(bookingId: string): Promise<ActionResult> {
  const session = await requireSession();

  const booking = await prisma.uitleenTransportBooking.findFirst({
    where: { id: bookingId, userId: session.user.id },
    include: { payments: { where: { status: 'SUCCEEDED' }, select: { id: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'REQUESTED' && booking.status !== 'APPROVED') {
    return { ok: false, error: 'Deze rit kan je niet meer annuleren.' };
  }
  if (booking.payments.length > 0) {
    return { ok: false, error: 'Deze rit is al betaald; mail logistiek@vtk.be om ze te annuleren.' };
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: booking.id },
    data: { status: 'CANCELLED' },
  });

  revalidateMember();
  return { ok: true, message: 'Rit geannuleerd.' };
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
  if (record.status !== 'APPROVED') {
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
      payment.status === 'PENDING' &&
      payment.checkoutUrl &&
      (!payment.expiresAt || payment.expiresAt > new Date())
  );
  if (pending?.checkoutUrl) return { ok: true, url: pending.checkoutUrl };

  const gateway = paymentGateway();
  const attempt = record.payments.length + 1;
  const idempotencyKey = `${target === 'reservation' ? 'res' : 'van'}:${record.id}:${attempt}`;
  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60 * 1000);
  const base = logistiekBaseUrl();
  const detailPath = target === 'reservation' ? `/reservaties/${record.id}` : `/vervoer/${record.id}`;

  const payment = await prisma.uitleenPayment.create({
    data: {
      reservationId: target === 'reservation' ? record.id : null,
      transportBookingId: target === 'van' ? record.id : null,
      provider: gateway.name,
      idempotencyKey,
      amountCents,
      expiresAt,
    },
  });

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
