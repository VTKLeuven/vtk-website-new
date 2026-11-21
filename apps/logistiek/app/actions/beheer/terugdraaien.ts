'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import { describeReservationChanges, parseDateOnly } from '@/lib/uitleen';
import { notifyReservation } from '@/lib/uitleen-mail';
import {
  flesserkeReserved,
  reservedQuantities,
  reservationConflicts,
  restoreFlesserkeStock,
} from '@/lib/uitleen-server';
import { buildReservationData, type ReservationFormInput } from '@/lib/reservation-form';
import { runSerializable } from '@/lib/tx';
import type { ActionResult } from '@/app/actions/uitleen';
import { BLOCKING_PAYMENT_STATUSES, revalidateBeheer } from './shared';

// ---------------------------------------------------------------------------
// Terugdraaien
//
// Elke stap in de flow kan één stap terug. Zonder dit betekende één verkeerde
// klik een ingreep in de database, en dat is precies wat deze app moest
// vervangen. Drie regels gelden overal:
//
// 1. Een stap die voorraad opnieuw inneemt (teruggebracht terugdraaien) doet dat
//    in dezelfde Serializable-transactie als de gewone flow, met dezelfde
//    voorraadcheck. Voorraad vrijgeven (goedkeuring terugdraaien) is altijd veilig.
// 2. Een geslaagde online betaling draai je hier niet terug: dat vraagt een
//    terugbetaling bij de provider. De actie weigert en zegt dat ook.
// 3. Elke terugdraaiing komt in de historiek, anders verdwijnt net het feit dat
//    je iets rechtgezet hebt.
// ---------------------------------------------------------------------------

export async function reopenReservationAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { status: true, paidOfflineAt: true, payments: { select: { status: true } } },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'APPROVED' && reservation.status !== 'REJECTED') {
    return {
      ok: false,
      error: 'Enkel een goedgekeurde of afgewezen aanvraag kan terug op "aangevraagd".',
    };
  }
  if (reservation.paidOfflineAt) {
    return { ok: false, error: 'Draai eerst de betaling terug; daarna kan de goedkeuring terug.' };
  }
  if (reservation.payments.some((payment) => BLOCKING_PAYMENT_STATUSES.includes(payment.status))) {
    return {
      ok: false,
      error: 'Er loopt een online betaling voor deze aanvraag; die moet eerst afgehandeld worden.',
    };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { status: 'REQUESTED', paymentMode: null, decidedAt: null, decidedById: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: reservation.status,
    toStatus: 'REQUESTED',
    note: 'beslissing teruggedraaid',
    actorId: session.user.id,
  });
  await notifyReservation(
    reservationId,
    'REOPENED',
    reservation.status === 'APPROVED'
      ? 'De goedkeuring is ingetrokken; je aanvraag wacht opnieuw op een beslissing.'
      : 'De afwijzing is ingetrokken; je aanvraag wacht opnieuw op een beslissing.',
    { actorId: session.user.id }
  );

  revalidateBeheer();
  return { ok: true, message: 'De aanvraag staat terug op "aangevraagd".' };
}

export async function undoPickedUpAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { status: true },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'PICKED_UP') {
    return { ok: false, error: 'Deze aanvraag staat niet op "afgehaald".' };
  }

  // Geen voorraadcheck nodig: APPROVED en PICKED_UP nemen allebei voorraad in.
  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { status: 'APPROVED', pickedUpAt: null, pickedUpById: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'PICKED_UP',
    toStatus: 'APPROVED',
    note: 'afhaling teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De afhaling is teruggedraaid.' };
}

/**
 * Terugbrengen terugdraaien. Dit is de zwaarste van de reeks: het materiaal komt
 * opnieuw uit de voorraad, en het flesserke-verbruik dat bij het terugbrengen
 * afgeboekt werd, moet terug op de plank. Beide in één transactie, met dezelfde
 * voorraadcheck als bij het goedkeuren; is de periode intussen volgeboekt, dan
 * gaat er niets door.
 */
export async function undoReturnedAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const outcome = await runSerializable(async (tx) => {
    const reservation = await tx.uitleenReservation.findUnique({
      where: { id: reservationId },
      include: {
        lines: { include: { item: { select: { quantity: true } } } },
        flesserkeLines: { include: { item: { select: { quantity: true } } } },
      },
    });
    if (!reservation) return { error: 'NOT_FOUND' as const };
    if (reservation.status !== 'RETURNED') return { error: 'NOT_RETURNED' as const };

    // Materiaal komt weer uit de voorraad zodra de aanvraag terug op PICKED_UP staat.
    const reserved = await reservedQuantities(tx, reservation.pickupDate, reservation.returnDate, {
      excludeReservationId: reservation.id,
    });
    for (const line of reservation.lines) {
      const available = line.item.quantity - (reserved.get(line.itemId) ?? 0);
      if (line.quantity > available) {
        return { error: 'NO_STOCK' as const, itemName: line.itemName };
      }
    }

    // Flesserke: het verbruik gaat terug naar de voorraad, maar de lijn neemt
    // ook weer plaats in. Per item optellen, want twee lijnen kunnen hetzelfde
    // item raken.
    const flReserved = await flesserkeReserved(tx, { excludeReservationId: reservation.id });
    const perItem = new Map<string, { stock: number; restored: number; needed: number; name: string }>();
    for (const line of reservation.flesserkeLines) {
      const entry = perItem.get(line.flesserkeItemId) ?? {
        stock: line.item.quantity,
        restored: 0,
        needed: 0,
        name: line.itemName,
      };
      entry.restored += line.quantity - (line.returnedQuantity ?? 0);
      entry.needed += line.quantity;
      perItem.set(line.flesserkeItemId, entry);
    }
    for (const [itemId, entry] of perItem) {
      const available = entry.stock + entry.restored - (flReserved.get(itemId) ?? 0) - entry.needed;
      if (available < 0) return { error: 'NO_STOCK' as const, itemName: entry.name };
    }

    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: { status: 'PICKED_UP', returnedAt: null, returnedById: null },
    });
    for (const line of reservation.flesserkeLines) {
      const consumed = line.quantity - (line.returnedQuantity ?? 0);
      await tx.uitleenFlesserkeLine.update({
        where: { id: line.id },
        data: { returnedQuantity: null },
      });
      // Terug op de oudste lading: het spiegelbeeld van het afboeken hierboven.
      if (consumed > 0) await restoreFlesserkeStock(tx, line.flesserkeItemId, consumed);
    }
    await writeAudit(tx, { reservationId }, {
      kind: 'STATUS_CHANGED',
      fromStatus: 'RETURNED',
      toStatus: 'PICKED_UP',
      note: 'terugbrengen teruggedraaid',
      actorId: session.user.id,
    });
    return { error: null };
  });

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome.error === 'NOT_RETURNED') {
    return { ok: false, error: 'Deze aanvraag staat niet op "teruggebracht".' };
  }
  if (outcome.error === 'NO_STOCK') {
    return {
      ok: false,
      error: `Terugdraaien kan niet: ${outcome.itemName} is intussen aan iemand anders toegewezen.`,
    };
  }

  revalidateBeheer();
  return { ok: true, message: 'Het terugbrengen is teruggedraaid; het materiaal staat weer uit.' };
}

export async function undoPaidOfflineAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { paidOfflineAt: true, payments: { select: { status: true } } },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (!reservation.paidOfflineAt) return { ok: false, error: 'Deze aanvraag staat niet als betaald.' };
  if (reservation.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Er is online betaald; terugbetalen loopt via de betaalprovider, niet via dit scherm.',
    };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { paidOfflineAt: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaling aan de balie teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De aanvraag staat weer als niet betaald.' };
}

export async function undoDepositReturnedAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { depositReturnedAt: true },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (!reservation.depositReturnedAt) {
    return { ok: false, error: 'De waarborg staat niet als teruggegeven.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { depositReturnedAt: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'waarborg teruggeven teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De waarborg staat weer open.' };
}

/**
 * Team-bewerking van een flesserke-aanvraag.
 *
 * Apart van {@link adminEditReservationAction}, want een flesserke-aanvraag heeft
 * geen materiaallijnen en de voorraadcheck is een andere: verbruiksgoed wordt
 * niet per periode gereserveerd maar in zijn geheel, tot het terugkomt.
 */
export async function adminEditFlesserkeReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  const session = await requireManage();

  const built = await buildReservationData({ ...input, lines: [] }, null);
  if (!built.ok) return built;

  const outcome = await runSerializable(
    async (tx): Promise<{ error: string | null; changes?: string[] }> => {
      const existing = await tx.uitleenReservation.findUnique({
        where: { id: reservationId },
        select: {
          status: true,
          paidOfflineAt: true,
          pickupDate: true,
          returnDate: true,
          pickupPart: true,
          returnPart: true,
          payments: { select: { status: true } },
          flesserkeLines: { select: { returnedQuantity: true, itemName: true, quantity: true } },
        },
      });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
        return { error: 'LOCKED' as const };
      }
      if (
        existing.paidOfflineAt ||
        existing.payments.some((payment) => ['CREATED', 'PENDING', 'SUCCEEDED'].includes(payment.status))
      ) {
        return { error: 'PAYMENT_LOCKED' as const };
      }
      // Een lijn waarvan het verbruik al afgeboekt is, mag je niet in aantal
      // wijzigen: de voorraad is dan al aangepast en het nieuwe aantal zou daar
      // niet meer bij passen. Draai eerst het terugbrengen terug.
      const settled = existing.flesserkeLines.find((line) => line.returnedQuantity !== null);
      if (settled) return { error: `SETTLED:${settled.itemName}` as const };

      // Enkel bij een goedgekeurde aanvraag neemt flesserke voorraad in; bij een
      // aanvraag die nog beslist moet worden, telt ze nog niet mee.
      if (existing.status === 'APPROVED') {
        const reserved = await flesserkeReserved(tx, { excludeReservationId: reservationId });
        const items = await tx.uitleenFlesserkeItem.findMany({
          where: { id: { in: built.flesserkeLineCreates.map((l) => l.flesserkeItemId) } },
          select: { id: true, quantity: true, name: true },
        });
        const byId = new Map(items.map((item) => [item.id, item]));
        for (const line of built.flesserkeLineCreates) {
          const item = byId.get(line.flesserkeItemId);
          const available = (item?.quantity ?? 0) - (reserved.get(line.flesserkeItemId) ?? 0);
          if (line.quantity > available) {
            return { error: `STOCK:${item?.name ?? line.itemName}` as const };
          }
        }
      }

      await tx.uitleenFlesserkeLine.deleteMany({ where: { reservationId } });
      await tx.uitleenReservation.update({
        where: { id: reservationId },
        data: { ...built.scalars, flesserkeLines: { create: built.flesserkeLineCreates } },
      });
      const changes = describeReservationChanges(
        {
          pickupDate: existing.pickupDate,
          returnDate: existing.returnDate,
          pickupPart: existing.pickupPart,
          returnPart: existing.returnPart,
          lines: existing.flesserkeLines,
        },
        {
          pickupDate: built.scalars.pickupDate,
          returnDate: built.scalars.returnDate,
          pickupPart: built.scalars.pickupPart,
          returnPart: built.scalars.returnPart,
          lines: built.flesserkeLineCreates,
        }
      );
      await writeAudit(tx, { reservationId }, {
        kind: 'EDITED',
        note: changes.length > 0 ? changes.join('; ') : 'aanvraagdetails aangepast',
        actorId: session.user.id,
      });
      return { error: null, changes };
    }
  );

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Aanvraag niet gevonden.' };
  if (outcome.error === 'LOCKED') return { ok: false, error: 'Deze aanvraag kan niet meer bewerkt worden.' };
  if (outcome.error === 'PAYMENT_LOCKED') {
    return {
      ok: false,
      error: 'Deze aanvraag heeft een actieve of voltooide betaling en kan niet meer gewijzigd worden.',
    };
  }
  if (outcome.error?.startsWith('SETTLED:')) {
    return {
      ok: false,
      error: `"${outcome.error.slice(8)}" is al afgeboekt bij het terugbrengen. Draai het terugbrengen eerst terug.`,
    };
  }
  if (outcome.error?.startsWith('STOCK:')) {
    return { ok: false, error: `Onvoldoende voorraad voor "${outcome.error.slice(6)}".` };
  }

  await notifyReservation(reservationId, 'EDITED', outcome.changes?.join('\n'), { actorId: session.user.id });
  revalidateBeheer();
  revalidatePath('/flesserke');
  return { ok: true, message: 'Flesserke-aanvraag bijgewerkt.' };
}

/**
 * Wat er zou botsen als deze aanvraag naar die datums verschuift, zonder iets op
 * te slaan. Voor de knop "past dit?" naast de datumvelden: schuiven zonder te
 * weten of het helpt, is twee keer schuiven.
 */
export async function previewShiftAction(
  reservationId: string,
  pickup: string,
  ret: string
): Promise<{ ok: true; fits: boolean; detail: string } | { ok: false; error: string }> {
  await requireManage();
  const pickupDate = parseDateOnly(pickup);
  const returnDate = parseDateOnly(ret);
  if (!pickupDate || !returnDate) return { ok: false, error: 'Kies twee geldige datums.' };
  if (returnDate < pickupDate) {
    return { ok: false, error: 'De terugbrengdatum ligt voor de afhaaldatum.' };
  }
  const conflicts = await reservationConflicts(reservationId, { pickupDate, returnDate });
  if (conflicts.length === 0) return { ok: true, fits: true, detail: 'Past in die periode.' };
  return {
    ok: true,
    fits: false,
    detail: conflicts
      .map((conflict) => `${conflict.itemName}: ${conflict.requested} gevraagd, ${conflict.available} vrij`)
      .join('; '),
  };
}

/**
 * Enkel de afhaal- en terugbrengdatum van een aanvraag verzetten.
 *
 * Voor twee aanvragen die om hetzelfde materiaal vechten: vaak passen ze samen
 * na een dag schuiven, en dan is de tweede afwijzen te grof. Dezelfde ingreep als
 * bij vervoer (V5), maar op dagen in plaats van uren.
 *
 * Een goedgekeurde aanvraag mag niet naar een periode schuiven waar ze niet past;
 * anders schuif je het probleem naar een derde aanvraag. Een aanvraag die nog
 * beslist moet worden, mag wél in een conflict blijven staan: dat is precies wat
 * M2 mogelijk maakt, en de harde check bij goedkeuren blijft.
 */
export async function shiftReservationDatesAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const reservationId = String(formData.get('reservationId') ?? '');
  const pickupDate = parseDateOnly(String(formData.get('pickupDate') ?? ''));
  const returnDate = parseDateOnly(String(formData.get('returnDate') ?? ''));
  if (!pickupDate || !returnDate) return saveError('DATE_INVALID');
  if (returnDate < pickupDate) return saveError('DATE_ORDER');

  const outcome = await runSerializable(
    async (tx): Promise<{ error: string | null; note?: string }> => {
      const existing = await tx.uitleenReservation.findUnique({
        where: { id: reservationId },
        select: {
          status: true,
          pickupDate: true,
          returnDate: true,
          lines: { select: { itemId: true, itemName: true, quantity: true } },
        },
      });
      if (!existing) return { error: 'NOT_FOUND' };
      if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
        return { error: 'LOCKED' };
      }
      if (
        existing.pickupDate.getTime() === pickupDate.getTime() &&
        existing.returnDate.getTime() === returnDate.getTime()
      ) {
        return { error: 'UNCHANGED' };
      }

      if (existing.status === 'APPROVED') {
        const reserved = await reservedQuantities(tx, pickupDate, returnDate, {
          excludeReservationId: reservationId,
        });
        const items = await tx.uitleenItem.findMany({
          where: { id: { in: existing.lines.map((line) => line.itemId) } },
          select: { id: true, quantity: true, name: true },
        });
        const byId = new Map(items.map((item) => [item.id, item]));
        for (const line of existing.lines) {
          const item = byId.get(line.itemId);
          const available = (item?.quantity ?? 0) - (reserved.get(line.itemId) ?? 0);
          if (line.quantity > available) return { error: `STOCK:${item?.name ?? line.itemName}` };
        }
      }

      await tx.uitleenReservation.update({
        where: { id: reservationId },
        data: { pickupDate, returnDate },
      });
      const changes = describeReservationChanges(
        { pickupDate: existing.pickupDate, returnDate: existing.returnDate, lines: existing.lines },
        { pickupDate, returnDate, lines: existing.lines }
      );
      const note = changes.join('; ');
      await writeAudit(tx, { reservationId }, {
        kind: 'EDITED',
        note,
        actorId: session.user.id,
      });
      return { error: null, note };
    }
  );

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'LOCKED') return saveError('LOCKED');
  if (outcome.error === 'UNCHANGED') return saveError('UNCHANGED');
  if (outcome.error?.startsWith('STOCK:')) {
    return saveError('STOCK', `"${outcome.error.slice(6)}" past niet in de nieuwe periode.`);
  }

  // De aanvrager hoort dit te weten zonder in te loggen; bij een conflict tussen
  // twee aanvragen verschuif je ze allebei, en dan krijgt elke aanvrager de mail
  // over zijn eigen aanvraag.
  await notifyReservation(reservationId, 'EDITED', outcome.note, { actorId: session.user.id });
  revalidateBeheer();
  return saveOk();
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
  const session = await requireManage();

  // Team-editor beheert de materiaallijnen; flesserke loopt via een eigen flow.
  const built = await buildReservationData({ ...input, flesserkeLines: [] }, null);
  if (!built.ok) return built;

  // Status, betaalstatus, voorraadcontrole en write gebeuren in één serializable
  // transactie. Zo kan een gelijktijdige goedkeuring/betaling nooit tussen de
  // controle en de edit komen, en een validatiefout commit geen halve edit.
  const outcome = await runSerializable(
    async (tx): Promise<{ error: string | null; changes?: string[] }> => {
      const existing = await tx.uitleenReservation.findUnique({
        where: { id: reservationId },
        select: {
          status: true,
          paidOfflineAt: true,
          pickupDate: true,
          returnDate: true,
          pickupPart: true,
          returnPart: true,
          payments: { select: { status: true } },
          lines: {
            select: {
              itemId: true,
              itemName: true,
              quantity: true,
              preparedAt: true,
              preparedById: true,
            },
          },
        },
      });
      if (!existing) return { error: 'NOT_FOUND' };
      if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
        return { error: 'LOCKED' };
      }
      if (
        existing.paidOfflineAt ||
        existing.payments.some((payment) =>
          ['CREATED', 'PENDING', 'SUCCEEDED'].includes(payment.status),
        )
      ) {
        return { error: 'PAYMENT_LOCKED' };
      }

      if (existing.status === 'APPROVED') {
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
            return { error: `STOCK:${item?.name ?? line.itemName}` };
          }
        }
      }

      // De lijnen worden vervangen, dus ook een vinkje van het klaarzetten zou
      // verdwijnen. Bij een lijn die niet veranderde (zelfde item, zelfde aantal)
      // is dat verkeerd: het team dat enkel de datum verschoof, zou de halve
      // loods opnieuw moeten afvinken. Wijzigt het aantal wél, dan klopt het
      // vinkje niet meer en valt het bewust weg.
      const preparedBefore = new Map(
        existing.lines
          .filter((line) => line.preparedAt !== null)
          .map((line) => [`${line.itemId}:${line.quantity}`, line])
      );
      await tx.uitleenReservationLine.deleteMany({ where: { reservationId } });
      await tx.uitleenReservation.update({
        where: { id: reservationId },
        data: {
          ...built.scalars,
          lines: {
            create: built.lineCreates.map((line) => {
              const kept = preparedBefore.get(`${line.itemId}:${line.quantity}`);
              return kept
                ? { ...line, preparedAt: kept.preparedAt, preparedById: kept.preparedById }
                : line;
            }),
          },
        },
      });
      // Wat er veranderde, niet hoeveel lijnen er overblijven: dit gaat zowel naar
      // de historiek als naar de mail aan de aanvrager.
      const changes = describeReservationChanges(
        {
          pickupDate: existing.pickupDate,
          returnDate: existing.returnDate,
          pickupPart: existing.pickupPart,
          returnPart: existing.returnPart,
          lines: existing.lines,
        },
        {
          pickupDate: built.scalars.pickupDate,
          returnDate: built.scalars.returnDate,
          pickupPart: built.scalars.pickupPart,
          returnPart: built.scalars.returnPart,
          lines: built.lineCreates,
        }
      );
      await writeAudit(tx, { reservationId }, {
        kind: 'EDITED',
        note: changes.length > 0 ? changes.join('; ') : 'aanvraagdetails aangepast',
        actorId: session.user.id,
      });
      return { error: null, changes };
    }
  );

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome.error === 'LOCKED') {
    return { ok: false, error: 'Deze aanvraag kan niet meer bewerkt worden.' };
  }
  if (outcome.error === 'PAYMENT_LOCKED') {
    return { ok: false, error: 'Deze aanvraag heeft een actieve of voltooide betaling en kan niet meer gewijzigd worden.' };
  }
  if (outcome.error?.startsWith('STOCK:')) {
    return { ok: false, error: `Onvoldoende voorraad voor "${outcome.error.slice(6)}".` };
  }
  await notifyReservation(reservationId, 'EDITED', outcome.changes?.join('\n'), { actorId: session.user.id });
  revalidateBeheer();
  return { ok: true, message: 'Aanvraag bijgewerkt.' };
}
