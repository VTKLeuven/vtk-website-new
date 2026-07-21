'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';
import { requireManage } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { rangesOverlap, transportPriceCents } from '@/lib/uitleen';
import { flesserkeReserved, reservedQuantities } from '@/lib/uitleen-server';
import { buildReservationData, type ReservationFormInput } from '@/lib/reservation-form';
import { runSerializable } from '@/lib/tx';
import type { ActionResult } from './uitleen';

function revalidateBeheer() {
  revalidatePath('/beheer');
  revalidatePath('/beheer/aanvragen');
  revalidatePath('/beheer/vervoer');
  revalidatePath('/beheer/materiaal');
  revalidatePath('/beheer/kalender');
  revalidatePath('/beheer/instellingen');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
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

/**
 * Versie waarop de editor het record laadde (de `updatedAt` die het formulier
 * meestuurt). Voor optimistic locking: bij het opslaan matchen we op deze
 * `updatedAt`, zodat een save die op verouderde data is gebaseerd (iemand
 * anders paste intussen aan) faalt in plaats van stilletjes te overschrijven.
 * Prisma beheert `@updatedAt` op milliseconde-precisie, dus de round-trip is
 * exact. Ontbreekt de waarde, dan valt de guard weg (last-write-wins).
 */
function parseExpectedVersion(raw: FormDataEntryValue | null): Date | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function saveCategoryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const sortIndex = Number.parseInt(String(formData.get('sortIndex') ?? '0'), 10) || 0;
  if (!name) return saveError('NAME_REQUIRED');

  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const updated = await prisma.uitleenCategory.updateMany({
      where: expected ? { id, updatedAt: expected } : { id },
      data: { name, sortIndex },
    });
    if (updated.count === 0) return saveError('STALE');
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

const ITEM_CONDITIONS = ['WERKT', 'KAPOT', 'TESTEN', 'ONVOLLEDIG'] as const;
type ItemCondition = (typeof ITEM_CONDITIONS)[number];

function parseSetContents(raw: FormDataEntryValue | null): Array<{ label: string; quantity: number }> {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        label: String(row?.label ?? '').trim(),
        quantity: Number.parseInt(String(row?.quantity ?? '1'), 10) || 1,
      }))
      .filter((row) => row.label !== '');
  } catch {
    return [];
  }
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
  const photoKey = String(formData.get('photoKey') ?? '').trim();
  const locationShelf = String(formData.get('locationShelf') ?? '').trim();
  const locationRack = String(formData.get('locationRack') ?? '').trim();
  const conditionRaw = String(formData.get('condition') ?? 'WERKT').trim();
  const condition: ItemCondition = ITEM_CONDITIONS.includes(conditionRaw as ItemCondition)
    ? (conditionRaw as ItemCondition)
    : 'WERKT';
  const conditionNote = String(formData.get('conditionNote') ?? '').trim();
  const isSet = String(formData.get('isSet') ?? '') === 'on';
  const setContents = isSet ? parseSetContents(formData.get('setContents')) : [];

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
    photoKey: photoKey || null,
    locationShelf: locationShelf || null,
    locationRack: locationRack || null,
    condition,
    conditionNote: conditionNote || null,
    isSet,
  };

  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const stale = await prisma.$transaction(async (tx) => {
      // Guard op de geladen versie: raakt 0 rijen als iemand anders het item
      // intussen wijzigde (of het verdween). updateMany laat een samengestelde
      // where toe; de scalar-update bumpt updatedAt vanzelf.
      const updated = await tx.uitleenItem.updateMany({
        where: expected ? { id, updatedAt: expected } : { id },
        data,
      });
      if (updated.count === 0) return true;
      await tx.uitleenSetContent.deleteMany({ where: { itemId: id } });
      if (setContents.length > 0) {
        await tx.uitleenSetContent.createMany({
          data: setContents.map((row, index) => ({
            itemId: id,
            label: row.label,
            quantity: row.quantity,
            sortIndex: index,
          })),
        });
      }
      return false;
    });
    if (stale) return saveError('STALE');
  } else {
    await prisma.uitleenItem.create({
      data: {
        ...data,
        setContents: {
          create: setContents.map((row, index) => ({
            label: row.label,
            quantity: row.quantity,
            sortIndex: index,
          })),
        },
      },
    });
  }

  revalidateBeheer();
  return saveOk();
}

/** Snelle voorraadbijstelling per item, zonder het hele item te bewerken. */
export async function setItemQuantityAction(itemId: string, quantity: number): Promise<ActionResult> {
  await requireManage();
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, error: 'Ongeldig aantal.' };
  await prisma.uitleenItem.update({ where: { id: itemId }, data: { quantity } });
  revalidateBeheer();
  return { ok: true, message: 'Voorraad bijgewerkt.' };
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
  const outcome = await runSerializable(async (tx) => {
    const reservation = await tx.uitleenReservation.findUnique({
      where: { id: reservationId },
      include: { lines: { include: { item: true } }, flesserkeLines: { include: { item: true } } },
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

    // Flesserke: verbruiksstock, status-gebaseerd gereserveerd (geen datumoverlap).
    if (reservation.flesserkeLines.length > 0) {
      const flReserved = await flesserkeReserved(tx, { excludeReservationId: reservation.id });
      for (const line of reservation.flesserkeLines) {
        const available = line.item.quantity - (flReserved.get(line.flesserkeItemId) ?? 0);
        if (line.quantity > available) {
          return { error: 'NO_STOCK' as const, itemName: line.itemName };
        }
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
  });

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

/**
 * Terugbrengen. `flesserkeReturned` mapt flesserke-lijn-id op het teruggekeerde
 * aantal (gesloten terug in stock); het verbruik (quantity - returned) wordt van
 * de voorraad afgeboekt. Alles in één transactie zodat de stock klopt.
 */
export async function markReturnedAction(
  reservationId: string,
  flesserkeReturned?: Record<string, number>
): Promise<ActionResult> {
  const session = await requireManage();

  // Statusguard en voorraadafboeking in één Serializable-transactie: twee
  // gelijktijdige "teruggebracht"-clicks mogen de flesserke-stock niet dubbel
  // afboeken. Verbruik per lijn = gereserveerd min teruggekeerd; ontbreekt een
  // waarde, dan is alles verbruikt (0 terug).
  const outcome = await runSerializable(async (tx) => {
    const reservation = await tx.uitleenReservation.findUnique({
      where: { id: reservationId },
      include: { flesserkeLines: true },
    });
    if (!reservation) return { error: 'NOT_FOUND' as const };
    if (reservation.status !== 'PICKED_UP') return { error: 'NOT_PICKED_UP' as const };

    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: { status: 'RETURNED', returnedAt: new Date(), returnedById: session.user.id },
    });
    for (const line of reservation.flesserkeLines) {
      const raw = flesserkeReturned?.[line.id];
      const returned = Number.isInteger(raw) ? Math.max(0, Math.min(line.quantity, raw as number)) : 0;
      const consumed = line.quantity - returned;
      await tx.uitleenFlesserkeLine.update({ where: { id: line.id }, data: { returnedQuantity: returned } });
      if (consumed > 0) {
        await tx.uitleenFlesserkeItem.update({
          where: { id: line.flesserkeItemId },
          data: { quantity: { decrement: consumed } },
        });
      }
    }
    return { error: null };
  });

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome.error === 'NOT_PICKED_UP') {
    return { ok: false, error: 'Enkel afgehaald materiaal kan teruggebracht worden.' };
  }

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

/**
 * Team-bewerking van een aanvraag. Mag REQUESTED en APPROVED bewerken (elke post
 * kiezen). Bij APPROVED loopt de save in dezelfde Serializable-transactie als het
 * goedkeuren en wordt de voorraad opnieuw gecheckt, zodat een APPROVED aanvraag
 * altijd door voorraad gedekt blijft.
 */
export async function adminEditReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  await requireManage();

  const existing = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
    return { ok: false, error: 'Deze aanvraag kan niet meer bewerkt worden.' };
  }

  // Team-editor beheert de materiaallijnen; flesserke loopt via een eigen flow.
  const built = await buildReservationData({ ...input, flesserkeLines: [] }, null);
  if (!built.ok) return built;

  if (existing.status === 'REQUESTED') {
    await prisma.$transaction([
      prisma.uitleenReservationLine.deleteMany({ where: { reservationId } }),
      prisma.uitleenReservation.update({
        where: { id: reservationId },
        data: { ...built.scalars, lines: { create: built.lineCreates } },
      }),
    ]);
    revalidateBeheer();
    return { ok: true, message: 'Aanvraag bijgewerkt.' };
  }

  // APPROVED: voorraad hercontroleren na de wijziging, in één transactie.
  const outcome = await runSerializable(
    async (tx) => {
      await tx.uitleenReservationLine.deleteMany({ where: { reservationId } });
      await tx.uitleenReservation.update({
        where: { id: reservationId },
        data: { ...built.scalars, lines: { create: built.lineCreates } },
      });
      const reserved = await reservedQuantities(tx, built.scalars.pickupDate, built.scalars.returnDate, {
        excludeReservationId: reservationId,
      });
      const items = await tx.uitleenItem.findMany({
        where: { id: { in: built.lineCreates.map((l) => l.itemId) } },
        select: { id: true, quantity: true, name: true },
      });
      const byId = new Map(items.map((i) => [i.id, i]));
      for (const line of built.lineCreates) {
        const item = byId.get(line.itemId);
        const available = (item?.quantity ?? 0) - (reserved.get(line.itemId) ?? 0);
        if (line.quantity > available) {
          return { error: `Onvoldoende voorraad voor "${item?.name ?? line.itemName}".` };
        }
      }
      return { error: null };
    }
  );

  if (outcome.error) return { ok: false, error: outcome.error };
  revalidateBeheer();
  return { ok: true, message: 'Aanvraag bijgewerkt.' };
}

// ---------------------------------------------------------------------------
// Vervoer (kar / auto / bakfiets)
// ---------------------------------------------------------------------------

/** Overlapt deze rit met een andere goedgekeurde rit van hetzelfde voertuig? */
async function vehicleHasOverlap(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  startAt: Date,
  endAt: Date,
  excludeId: string
): Promise<boolean> {
  const others = await tx.uitleenTransportBooking.findMany({
    where: { vehicleId, status: 'APPROVED', id: { not: excludeId } },
    select: { startAt: true, endAt: true },
  });
  return others.some((other) => rangesOverlap(startAt, endAt, other.startAt, other.endAt));
}

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

  const outcome = await runSerializable(
    async (tx) => {
      const booking = await tx.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
      if (!booking) return { error: 'NOT_FOUND' as const };
      if (booking.status !== 'REQUESTED') return { error: 'NOT_REQUESTED' as const };

      // Per voertuig: geen twee goedgekeurde ritten op hetzelfde moment.
      if (await vehicleHasOverlap(tx, booking.vehicleId, booking.startAt, booking.endAt, booking.id)) {
        return { error: 'OVERLAP' as const };
      }

      await tx.uitleenTransportBooking.update({
        where: { id: booking.id },
        data: {
          status: 'APPROVED',
          paymentMode,
          driverId: driverId || null,
          adminNote: adminNote || null,
          // Prijs definitief maken volgens de gesnapshotte tariefmodus. Blijft null
          // voor per-km-ritten: die prijs wordt pas bij afronden gekend.
          priceCents: transportPriceCents({
            pricingMode: booking.pricingMode,
            rateCents: booking.rateCents,
            startAt: booking.startAt,
            endAt: booking.endAt,
          }),
          decidedAt: new Date(),
          decidedById: session.user.id,
        },
      });
      return { error: null };
    }
  );

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'NOT_REQUESTED') return saveError('NOT_REQUESTED');
  if (outcome.error === 'OVERLAP') return saveError('OVERLAP');

  revalidateBeheer();
  return saveOk();
}

export async function rejectTransportAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const bookingId = String(formData.get('bookingId') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (!adminNote) return saveError('NOTE_REQUIRED');

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return saveError('NOT_FOUND');
  if (booking.status !== 'REQUESTED') return saveError('NOT_REQUESTED');

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { status: 'REJECTED', adminNote, decidedAt: new Date(), decidedById: session.user.id },
  });

  revalidateBeheer();
  return saveOk();
}

/** Chauffeur toewijzen of wijzigen; kan op elk moment voor de rit afgerond is. */
export async function assignDriverAction(bookingId: string, driverId: string): Promise<ActionResult> {
  await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status === 'REJECTED' || booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return { ok: false, error: 'Voor deze rit kan je geen chauffeur meer toewijzen.' };
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { driverId: driverId || null },
  });

  revalidateBeheer();
  return { ok: true, message: driverId ? 'Chauffeur toegewezen.' : 'Chauffeur verwijderd.' };
}

/** Voertuig wisselen: tarief opnieuw snapshotten en de prijs herberekenen. */
export async function changeVehicleAction(bookingId: string, vehicleId: string): Promise<ActionResult> {
  await requireManage();

  const outcome = await runSerializable(
    async (tx) => {
      const booking = await tx.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
      if (!booking) return { error: 'NOT_FOUND' as const };
      if (booking.status === 'REJECTED' || booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
        return { error: 'LOCKED' as const };
      }
      const vehicle = await tx.uitleenVehicle.findFirst({ where: { id: vehicleId, active: true } });
      if (!vehicle) return { error: 'NO_VEHICLE' as const };

      if (
        booking.status === 'APPROVED' &&
        (await vehicleHasOverlap(tx, vehicle.id, booking.startAt, booking.endAt, booking.id))
      ) {
        return { error: 'OVERLAP' as const };
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
      return { error: null };
    }
  );

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Rit niet gevonden.' };
  if (outcome.error === 'LOCKED') return { ok: false, error: 'Voor deze rit kan je het voertuig niet meer wisselen.' };
  if (outcome.error === 'NO_VEHICLE') return { ok: false, error: 'Voertuig niet gevonden.' };
  if (outcome.error === 'OVERLAP') return { ok: false, error: 'Dat voertuig is al geboekt op dat moment.' };

  revalidateBeheer();
  return { ok: true, message: 'Voertuig gewijzigd.' };
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

  revalidateBeheer();
  return { ok: true, message: 'Rit afgerond.' };
}

export async function markTransportPaidOfflineAction(bookingId: string): Promise<ActionResult> {
  await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.paidOfflineAt) return { ok: false, error: 'Al gemarkeerd als betaald.' };

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { paidOfflineAt: new Date() },
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als betaald.' };
}

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

const PRICING_MODES = ['FREE', 'PER_HOUR', 'PER_KM', 'FLAT'] as const;
type PricingMode = (typeof PRICING_MODES)[number];

export async function saveVehicleAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const nameNl = String(formData.get('nameNl') ?? '').trim();
  const nameEn = String(formData.get('nameEn') ?? '').trim() || nameNl;
  const description = String(formData.get('description') ?? '').trim();
  const modeRaw = String(formData.get('pricingMode') ?? 'FREE').trim();
  const pricingMode: PricingMode = PRICING_MODES.includes(modeRaw as PricingMode)
    ? (modeRaw as PricingMode)
    : 'FREE';
  const rateCents = parseEuroToCents(formData.get('rate'));
  if (!nameNl) return saveError('NAME_REQUIRED');
  if (rateCents === null) return saveError('AMOUNT_INVALID');

  const data = {
    nameNl,
    nameEn,
    description: description || null,
    pricingMode,
    rateCents: pricingMode === 'FREE' ? 0 : rateCents,
  };
  if (id) {
    await prisma.uitleenVehicle.update({ where: { id }, data });
  } else {
    // Nieuwe voertuigen: code afgeleid van de naam, uniek gemaakt.
    const base = nameNl.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'voertuig';
    let code = base;
    for (let i = 2; await prisma.uitleenVehicle.findUnique({ where: { code } }); i += 1) {
      code = `${base}-${i}`;
    }
    const count = await prisma.uitleenVehicle.count();
    await prisma.uitleenVehicle.create({ data: { ...data, code, sortIndex: count } });
  }

  revalidateBeheer();
  return saveOk();
}

export async function setVehicleActiveAction(vehicleId: string, active: boolean): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenVehicle.update({ where: { id: vehicleId }, data: { active } });
  revalidateBeheer();
  return { ok: true, message: active ? 'Voertuig terug beschikbaar.' : 'Voertuig gedeactiveerd.' };
}

const LOGISTIEK_SETTINGS_KEY = 'logistiek.settings';

export async function saveLogistiekSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const showRentPrices = String(formData.get('showRentPrices') ?? '') === 'on';
  await prisma.setting.upsert({
    where: { key: LOGISTIEK_SETTINGS_KEY },
    update: { value: { showRentPrices } },
    create: { key: LOGISTIEK_SETTINGS_KEY, value: { showRentPrices } },
  });
  revalidateBeheer();
  return saveOk();
}

// ---------------------------------------------------------------------------
// Flesserke (verbruiksstock beheren)
// ---------------------------------------------------------------------------

export async function saveFlesserkeCategoryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const sortIndex = Number.parseInt(String(formData.get('sortIndex') ?? '0'), 10) || 0;
  if (!name) return saveError('NAME_REQUIRED');
  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const updated = await prisma.uitleenFlesserkeCategory.updateMany({
      where: expected ? { id, updatedAt: expected } : { id },
      data: { name, sortIndex },
    });
    if (updated.count === 0) return saveError('STALE');
  } else {
    await prisma.uitleenFlesserkeCategory.create({ data: { name, sortIndex } });
  }
  revalidateBeheer();
  return saveOk();
}

export async function saveFlesserkeItemAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const brand = String(formData.get('brand') ?? '').trim();
  const contentAmount = String(formData.get('contentAmount') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const quantity = Number.parseInt(String(formData.get('quantity') ?? ''), 10);
  const colruytUrl = String(formData.get('colruytUrl') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const locationShelf = String(formData.get('locationShelf') ?? '').trim();
  const locationRack = String(formData.get('locationRack') ?? '').trim();
  const expiryRaw = String(formData.get('expiryDate') ?? '').trim();

  if (!name) return saveError('NAME_REQUIRED');
  if (!Number.isInteger(quantity) || quantity < 0) return saveError('QUANTITY_INVALID');
  let expiryDate: Date | null = null;
  if (expiryRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryRaw)) return saveError('DATE_INVALID');
    expiryDate = new Date(`${expiryRaw}T00:00:00.000Z`);
  }

  const data = {
    name,
    brand: brand || null,
    contentAmount: contentAmount || null,
    categoryId: categoryId || null,
    quantity,
    colruytUrl: colruytUrl || null,
    note: note || null,
    locationShelf: locationShelf || null,
    locationRack: locationRack || null,
    expiryDate,
  };
  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const updated = await prisma.uitleenFlesserkeItem.updateMany({
      where: expected ? { id, updatedAt: expected } : { id },
      data,
    });
    if (updated.count === 0) return saveError('STALE');
  } else {
    await prisma.uitleenFlesserkeItem.create({ data });
  }
  revalidateBeheer();
  return saveOk();
}

/** Snelle voorraadbijstelling (wekelijkse upkeep) zonder het hele item te bewerken. */
export async function setFlesserkeQuantityAction(itemId: string, quantity: number): Promise<ActionResult> {
  await requireManage();
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, error: 'Ongeldig aantal.' };
  await prisma.uitleenFlesserkeItem.update({ where: { id: itemId }, data: { quantity } });
  revalidateBeheer();
  return { ok: true, message: 'Voorraad bijgewerkt.' };
}

export async function setFlesserkeItemActiveAction(itemId: string, active: boolean): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenFlesserkeItem.update({ where: { id: itemId }, data: { active } });
  revalidateBeheer();
  return { ok: true, message: active ? 'Terug in de lijst.' : 'Uit de lijst gehaald.' };
}

export async function deactivateFlesserkeCategoryAction(categoryId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenFlesserkeCategory.update({ where: { id: categoryId }, data: { active: false } });
  revalidateBeheer();
  return { ok: true, message: 'Categorie uit de lijst gehaald.' };
}
