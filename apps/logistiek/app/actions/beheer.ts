'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { rangesOverlap, vanPriceCents } from '@/lib/uitleen';
import { reservedQuantities } from '@/lib/uitleen-server';
import type { ActionResult } from './uitleen';

function revalidateBeheer() {
  revalidatePath('/beheer');
  revalidatePath('/beheer/aanvragen');
  revalidatePath('/beheer/camionette');
  revalidatePath('/beheer/materiaal');
  revalidatePath('/beheer/kalender');
  revalidatePath('/materiaal');
  revalidatePath('/reservaties');
}

// ---------------------------------------------------------------------------
// Inventaris
// ---------------------------------------------------------------------------

function parseEuroToCents(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (text === '') return 0;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export async function saveCategoryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const sortIndex = Number.parseInt(String(formData.get('sortIndex') ?? '0'), 10) || 0;
  if (!name) return saveError('NAME_REQUIRED');

  if (id) {
    await prisma.uitleenCategory.update({ where: { id }, data: { name, sortIndex } });
  } else {
    await prisma.uitleenCategory.create({ data: { name, sortIndex } });
  }

  revalidateBeheer();
  return saveOk();
}

export async function deactivateCategoryAction(categoryId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenCategory.update({ where: { id: categoryId }, data: { active: false } });
  revalidateBeheer();
  return { ok: true, message: 'Categorie uit de catalogus gehaald.' };
}

export async function saveItemAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const quantity = Number.parseInt(String(formData.get('quantity') ?? ''), 10);
  const priceCents = parseEuroToCents(formData.get('price'));
  const depositCents = parseEuroToCents(formData.get('deposit'));

  if (!name) return saveError('NAME_REQUIRED');
  if (!Number.isInteger(quantity) || quantity < 1) return saveError('QUANTITY_INVALID');
  if (priceCents === null || depositCents === null) return saveError('AMOUNT_INVALID');

  const data = {
    name,
    description: description || null,
    categoryId: categoryId || null,
    quantity,
    priceCents,
    depositCents,
  };

  if (id) {
    await prisma.uitleenItem.update({ where: { id }, data });
  } else {
    await prisma.uitleenItem.create({ data });
  }

  revalidateBeheer();
  return saveOk();
}

export async function deactivateItemAction(itemId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenItem.update({ where: { id: itemId }, data: { active: false } });
  revalidateBeheer();
  return { ok: true, message: 'Item uit de catalogus gehaald; de historiek blijft bewaard.' };
}

export async function activateItemAction(itemId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenItem.update({ where: { id: itemId }, data: { active: true } });
  revalidateBeheer();
  return { ok: true, message: 'Item terug in de catalogus gezet.' };
}

// ---------------------------------------------------------------------------
// Materiaalaanvragen
// ---------------------------------------------------------------------------

export async function approveReservationAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const reservationId = String(formData.get('reservationId') ?? '');
  const paymentMode = String(formData.get('paymentMode') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (paymentMode !== 'ONLINE' && paymentMode !== 'OFFLINE') return saveError('MODE_REQUIRED');

  // Harde beschikbaarheidscheck en statuswissel in één transactie, zodat twee
  // gelijktijdige goedkeuringen niet allebei dezelfde voorraad wegkapen.
  const outcome = await prisma.$transaction(async (tx) => {
    const reservation = await tx.uitleenReservation.findUnique({
      where: { id: reservationId },
      include: { lines: { include: { item: true } } },
    });
    if (!reservation) return { error: 'NOT_FOUND' as const };
    if (reservation.status !== 'REQUESTED') return { error: 'NOT_REQUESTED' as const };

    const reserved = await reservedQuantities(tx, reservation.pickupDate, reservation.returnDate, {
      excludeReservationId: reservation.id,
    });
    for (const line of reservation.lines) {
      const available = line.item.quantity - (reserved.get(line.itemId) ?? 0);
      if (line.quantity > available) {
        return { error: 'NO_STOCK' as const, itemName: line.itemName };
      }
    }

    await tx.uitleenReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'APPROVED',
        paymentMode,
        adminNote: adminNote || null,
        decidedAt: new Date(),
        decidedById: session.user.id,
      },
    });
    return { error: null };
  }, { isolationLevel: 'Serializable' });

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'NOT_REQUESTED') return saveError('NOT_REQUESTED');
  if (outcome.error === 'NO_STOCK') return saveError('NO_STOCK');

  revalidateBeheer();
  return saveOk();
}

export async function rejectReservationAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const reservationId = String(formData.get('reservationId') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (!adminNote) return saveError('NOTE_REQUIRED');

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return saveError('NOT_FOUND');
  if (reservation.status !== 'REQUESTED') return saveError('NOT_REQUESTED');

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: {
      status: 'REJECTED',
      adminNote,
      decidedAt: new Date(),
      decidedById: session.user.id,
    },
  });

  revalidateBeheer();
  return saveOk();
}

export async function markPickedUpAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'APPROVED') {
    return { ok: false, error: 'Enkel een goedgekeurde reservatie kan afgehaald worden.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { status: 'PICKED_UP', pickedUpAt: new Date(), pickedUpById: session.user.id },
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als afgehaald.' };
}

export async function markReturnedAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'PICKED_UP') {
    return { ok: false, error: 'Enkel afgehaald materiaal kan teruggebracht worden.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { status: 'RETURNED', returnedAt: new Date(), returnedById: session.user.id },
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als teruggebracht.' };
}

export async function markPaidOfflineAction(reservationId: string): Promise<ActionResult> {
  await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.paidOfflineAt) return { ok: false, error: 'Al gemarkeerd als betaald.' };

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { paidOfflineAt: new Date() },
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als betaald.' };
}

export async function markDepositReturnedAction(reservationId: string): Promise<ActionResult> {
  await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'RETURNED') {
    return { ok: false, error: 'De waarborg gaat pas terug nadat alles teruggebracht is.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { depositReturnedAt: new Date() },
  });

  revalidateBeheer();
  return { ok: true, message: 'Waarborg gemarkeerd als teruggegeven.' };
}

// ---------------------------------------------------------------------------
// Camionette
// ---------------------------------------------------------------------------

export async function approveVanBookingAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const bookingId = String(formData.get('bookingId') ?? '');
  const paymentMode = String(formData.get('paymentMode') ?? '');
  const driverId = String(formData.get('driverId') ?? '').trim();
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (paymentMode !== 'ONLINE' && paymentMode !== 'OFFLINE') return saveError('MODE_REQUIRED');

  const outcome = await prisma.$transaction(async (tx) => {
    const booking = await tx.uitleenVanBooking.findUnique({ where: { id: bookingId } });
    if (!booking) return { error: 'NOT_FOUND' as const };
    if (booking.status !== 'REQUESTED') return { error: 'NOT_REQUESTED' as const };

    // Eén camionette: geen twee goedgekeurde ritten op hetzelfde moment.
    const others = await tx.uitleenVanBooking.findMany({
      where: { status: 'APPROVED', id: { not: booking.id } },
      select: { startAt: true, endAt: true },
    });
    if (others.some((other) => rangesOverlap(booking.startAt, booking.endAt, other.startAt, other.endAt))) {
      return { error: 'OVERLAP' as const };
    }

    await tx.uitleenVanBooking.update({
      where: { id: booking.id },
      data: {
        status: 'APPROVED',
        paymentMode,
        driverId: driverId || null,
        adminNote: adminNote || null,
        // Prijs definitief maken op basis van het gesnapshotte uurtarief.
        priceCents: vanPriceCents(booking.startAt, booking.endAt, booking.hourlyRateCents),
        decidedAt: new Date(),
        decidedById: session.user.id,
      },
    });
    return { error: null };
  }, { isolationLevel: 'Serializable' });

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'NOT_REQUESTED') return saveError('NOT_REQUESTED');
  if (outcome.error === 'OVERLAP') return saveError('OVERLAP');

  revalidateBeheer();
  return saveOk();
}

export async function rejectVanBookingAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const bookingId = String(formData.get('bookingId') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (!adminNote) return saveError('NOTE_REQUIRED');

  const booking = await prisma.uitleenVanBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return saveError('NOT_FOUND');
  if (booking.status !== 'REQUESTED') return saveError('NOT_REQUESTED');

  await prisma.uitleenVanBooking.update({
    where: { id: bookingId },
    data: { status: 'REJECTED', adminNote, decidedAt: new Date(), decidedById: session.user.id },
  });

  revalidateBeheer();
  return saveOk();
}

export async function completeVanBookingAction(bookingId: string): Promise<ActionResult> {
  await requireManage();

  const booking = await prisma.uitleenVanBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'APPROVED') {
    return { ok: false, error: 'Enkel een goedgekeurde rit kan afgerond worden.' };
  }

  await prisma.uitleenVanBooking.update({
    where: { id: bookingId },
    data: { status: 'COMPLETED' },
  });

  revalidateBeheer();
  return { ok: true, message: 'Rit afgerond.' };
}

export async function markVanPaidOfflineAction(bookingId: string): Promise<ActionResult> {
  await requireManage();

  const booking = await prisma.uitleenVanBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.paidOfflineAt) return { ok: false, error: 'Al gemarkeerd als betaald.' };

  await prisma.uitleenVanBooking.update({
    where: { id: bookingId },
    data: { paidOfflineAt: new Date() },
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als betaald.' };
}
