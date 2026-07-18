'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireSession } from '@/lib/session';
import {
  parseDateOnly,
  todayDateOnly,
  vanPriceCents,
  VAN_HOURLY_RATE_CENTS,
  type ReservationLineInput,
} from '@/lib/uitleen';
import { availabilityForRange } from '@/lib/uitleen-server';
import { logistiekBaseUrl, paymentGateway } from '@/lib/payments';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Max lengte van een uitleenperiode; langere aanvragen verlopen via e-mail. */
const MAX_RESERVATION_DAYS = 14;
const MAX_NOTE_LENGTH = 1000;

function revalidateMember() {
  revalidatePath('/reservaties');
  revalidatePath('/materiaal');
  revalidatePath('/camionette');
}

export async function createReservationAction(input: {
  pickupDate: string;
  returnDate: string;
  note: string;
  lines: ReservationLineInput[];
}): Promise<ActionResult> {
  const session = await requireSession();

  const pickupDate = parseDateOnly(input.pickupDate);
  const returnDate = parseDateOnly(input.returnDate);
  if (!pickupDate || !returnDate) return { ok: false, error: 'Kies een afhaal- en terugbrengdatum.' };
  if (pickupDate < todayDateOnly()) return { ok: false, error: 'De afhaaldatum ligt in het verleden.' };
  if (returnDate < pickupDate) {
    return { ok: false, error: 'De terugbrengdatum ligt voor de afhaaldatum.' };
  }
  const days = (returnDate.getTime() - pickupDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
  if (days > MAX_RESERVATION_DAYS) {
    return {
      ok: false,
      error: `Een reservatie kan maximaal ${MAX_RESERVATION_DAYS} dagen duren; mail logistiek@vtk.be voor langere periodes.`,
    };
  }

  const note = input.note.trim().slice(0, MAX_NOTE_LENGTH);
  const lines = input.lines.filter((line) => Number.isInteger(line.quantity) && line.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'Kies minstens één item.' };
  const itemIds = lines.map((line) => line.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    return { ok: false, error: 'Elk item mag maar één keer in de aanvraag staan.' };
  }

  const items = await prisma.uitleenItem.findMany({
    where: { id: { in: itemIds }, active: true },
  });
  if (items.length !== itemIds.length) {
    return { ok: false, error: 'Een van de gekozen items bestaat niet meer; herlaad de catalogus.' };
  }
  const byId = new Map(items.map((item) => [item.id, item]));

  // Zachte check: een aanvraag boven de totale voorraad is zinloos. De harde
  // check tegen andere reservaties gebeurt bij goedkeuring door het team.
  for (const line of lines) {
    const item = byId.get(line.itemId)!;
    if (line.quantity > item.quantity) {
      return {
        ok: false,
        error: `Van "${item.name}" zijn er maar ${item.quantity} beschikbaar.`,
      };
    }
  }

  let totalPriceCents = 0;
  let totalDepositCents = 0;
  for (const line of lines) {
    const item = byId.get(line.itemId)!;
    totalPriceCents += item.priceCents * line.quantity;
    totalDepositCents += item.depositCents * line.quantity;
  }

  await prisma.uitleenReservation.create({
    data: {
      userId: session.user.id,
      pickupDate,
      returnDate,
      memberNote: note || null,
      totalPriceCents,
      totalDepositCents,
      lines: {
        create: lines.map((line) => {
          const item = byId.get(line.itemId)!;
          return {
            itemId: item.id,
            itemName: item.name,
            quantity: line.quantity,
            unitPriceCents: item.priceCents,
            unitDepositCents: item.depositCents,
          };
        }),
      },
    },
  });

  revalidateMember();
  return { ok: true, message: 'Aanvraag ingediend. Je vindt de status bij Mijn aanvragen.' };
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
  if (!purpose) return { ok: false, error: 'Beschrijf waarvoor je de camionette nodig hebt.' };

  await prisma.uitleenVanBooking.create({
    data: {
      userId: session.user.id,
      startAt,
      endAt,
      purpose: purpose.slice(0, MAX_NOTE_LENGTH),
      pickupAddress: input.pickupAddress.trim().slice(0, 300) || null,
      destination: input.destination.trim().slice(0, 300) || null,
      memberNote: input.note.trim().slice(0, MAX_NOTE_LENGTH) || null,
      hourlyRateCents: VAN_HOURLY_RATE_CENTS,
      priceCents: vanPriceCents(startAt, endAt),
    },
  });

  revalidateMember();
  return { ok: true, message: 'Rit aangevraagd. Je vindt de status bij Mijn aanvragen.' };
}

export async function cancelVanBookingAction(bookingId: string): Promise<ActionResult> {
  const session = await requireSession();

  const booking = await prisma.uitleenVanBooking.findFirst({
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

  await prisma.uitleenVanBooking.update({
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
      : await prisma.uitleenVanBooking.findFirst({
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
  const detailPath = target === 'reservation' ? `/reservaties/${record.id}` : `/camionette/${record.id}`;

  const payment = await prisma.uitleenPayment.create({
    data: {
      reservationId: target === 'reservation' ? record.id : null,
      vanBookingId: target === 'van' ? record.id : null,
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
      eventName: target === 'reservation' ? 'VTK uitleendienst' : 'VTK camionette',
      currency: 'EUR',
      lines: [
        {
          name: target === 'reservation' ? 'Huur materiaal' : 'Camionette-rit',
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

/**
 * "YYYY-MM-DDTHH:mm" uit een datetime-local-input, gelezen als Belgische
 * wall-clock tijd en omgezet naar een absoluut tijdstip.
 */
function parseBrusselsDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  // Bepaal de UTC-offset van Brussel op die dag (CET of CEST) door de wall-clock
  // te vergelijken met dezelfde string als UTC gelezen.
  const asUtc = new Date(`${value}:00.000Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(asUtc).map((part) => [part.type, part.value])
  );
  const brusselsAsUtc = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:00.000Z`
  );
  const offsetMs = brusselsAsUtc.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}
