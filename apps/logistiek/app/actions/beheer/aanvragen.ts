'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import { notifyReservation } from '@/lib/uitleen-mail';
import { consumeFlesserkeStock, flesserkeReserved, reservedQuantities } from '@/lib/uitleen-server';
import { runSerializable } from '@/lib/tx';
import type { ActionResult } from '@/app/actions/uitleen';
import { revalidateBeheer } from './shared';

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

    // Niet toegekende lijnen (M3) tellen niet mee: ze blijven op de aanvraag
    // staan met de reden erbij, maar nemen geen voorraad in en hoeven dus ook
    // geen beschikbaarheidscheck te doorstaan.
    const grantedLines = reservation.lines.filter((line) => line.lineStatus !== 'REJECTED');
    if (grantedLines.length === 0 && reservation.flesserkeLines.length === 0) {
      return { error: 'ALL_REJECTED' as const };
    }

    const reserved = await reservedQuantities(tx, reservation.pickupDate, reservation.returnDate, {
      excludeReservationId: reservation.id,
    });
    for (const line of grantedLines) {
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
    // Wat nog open stond, is nu toegekend; wat het team eerder al weigerde,
    // blijft geweigerd (M3).
    await tx.uitleenReservationLine.updateMany({
      where: { reservationId: reservation.id, lineStatus: 'REQUESTED' },
      data: { lineStatus: 'APPROVED' },
    });
    const rejected = reservation.lines.length - grantedLines.length;
    await writeAudit(tx, { reservationId: reservation.id }, {
      kind: 'STATUS_CHANGED',
      fromStatus: reservation.status,
      toStatus: 'APPROVED',
      note: [
        paymentMode === 'ONLINE' ? 'online betalen' : 'betalen aan de balie',
        rejected > 0 ? `${rejected} van de ${reservation.lines.length} items niet toegekend` : null,
      ]
        .filter(Boolean)
        .join('; '),
      actorId: session.user.id,
    });
    return { error: null };
  });

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'NOT_REQUESTED') return saveError('NOT_REQUESTED');
  if (outcome.error === 'NO_STOCK') return saveError('NO_STOCK');
  if (outcome.error === 'ALL_REJECTED') return saveError('ALL_REJECTED');

  // Pas na de transactie: een mail over een goedkeuring die door een rollback
  // niet doorging, is erger dan geen mail.
  await notifyReservation(
    reservationId,
    'APPROVED',
    paymentMode === 'ONLINE'
      ? 'Betalen gebeurt online; je vindt de betaalknop bij je aanvraag.'
      : 'Betalen gebeurt aan de balie bij het afhalen.',
    { actorId: session.user.id }
  );

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
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: reservation.status,
    toStatus: 'REJECTED',
    note: `reden: ${adminNote}`,
    actorId: session.user.id,
  });
  await notifyReservation(reservationId, 'REJECTED', adminNote, { actorId: session.user.id });

  revalidateBeheer();
  return saveOk();
}

/**
 * Eén lijn af- of terug aanvinken bij het klaarzetten.
 *
 * Bewust per lijn en niet per aanvraag: een shift zet een aanvraag zelden in één
 * keer klaar, en de volgende shift moet zien hoever de vorige raakte. Het schrijft
 * geen historiekregel; twaalf regels "lijn afgevinkt" zouden de historiek van de
 * aanvraag onleesbaar maken, en wie wat klaarzette staat al op de lijn zelf.
 */
export async function setLinePreparedAction(
  lineId: string,
  prepared: boolean
): Promise<ActionResult> {
  const session = await requireManage();

  const line = await prisma.uitleenReservationLine.findUnique({
    where: { id: lineId },
    select: { reservation: { select: { id: true, status: true } } },
  });
  if (!line) return { ok: false, error: 'Lijn niet gevonden.' };
  // Klaarzetten hoort bij een aanvraag die nog moet vertrekken. Na het
  // terugbrengen is het vinkje geschiedenis, niet iets om nog te wijzigen.
  if (line.reservation.status !== 'APPROVED' && line.reservation.status !== 'PICKED_UP') {
    return { ok: false, error: 'Klaarzetten kan enkel bij een goedgekeurde aanvraag.' };
  }

  await prisma.uitleenReservationLine.update({
    where: { id: lineId },
    data: prepared
      ? { preparedAt: new Date(), preparedById: session.user.id }
      : { preparedAt: null, preparedById: null },
  });

  revalidatePath(`/beheer/aanvragen/${line.reservation.id}`);
  revalidatePath('/beheer/aanvragen');
  return { ok: true };
}

/**
 * De beslissing en de teamnota van één materiaallijn (M1, M3).
 *
 * Goedkeuren werkte tot nu toe op de hele aanvraag: vijf items waarvan er één
 * niet vrij is, betekende de hele aanvraag afwijzen of ze stilzwijgend uitkleden
 * bij het bewerken. Nu kan het team één lijn niet toekennen; ze blijft staan met
 * de reden erbij, zodat de aanvrager ziet wat er niet doorging en waarom.
 *
 * De nota is een tweede veld naast `note` van het lid. Eén gedeeld veld liet de
 * tweede schrijver de eerste overschrijven zonder dat iemand zag dat er iets weg
 * was.
 *
 * Een lijn opnieuw toekennen op een aanvraag die al goedgekeurd is, neemt
 * voorraad in die intussen aan iemand anders kan zijn toegewezen; die stap doet
 * daarom dezelfde harde check als het goedkeuren zelf.
 */
export async function saveLineDecisionAction(
  lineId: string,
  input: { lineStatus: 'REQUESTED' | 'APPROVED' | 'REJECTED'; adminNote: string }
): Promise<ActionResult> {
  const session = await requireManage();

  const line = await prisma.uitleenReservationLine.findUnique({
    where: { id: lineId },
    include: { item: { select: { quantity: true } }, reservation: true },
  });
  if (!line) return { ok: false, error: 'Lijn niet gevonden.' };

  const reservation = line.reservation;
  if (reservation.status === 'RETURNED' || reservation.status === 'CANCELLED') {
    return { ok: false, error: 'Deze aanvraag is afgehandeld; ze kan niet meer gewijzigd worden.' };
  }

  const adminNote = input.adminNote.trim().slice(0, 500);
  // Een lijn op een aanvraag die nog niet beslist is, blijft REQUESTED tot de
  // aanvraag goedgekeurd wordt; enkel "niet toekennen" is daar al een beslissing.
  const decided = reservation.status !== 'REQUESTED';
  const lineStatus =
    input.lineStatus === 'REJECTED' ? 'REJECTED' : decided ? 'APPROVED' : 'REQUESTED';

  const grantingAgain = lineStatus === 'APPROVED' && line.lineStatus === 'REJECTED';
  if (grantingAgain) {
    const outcome = await runSerializable(async (tx) => {
      const reserved = await reservedQuantities(tx, reservation.pickupDate, reservation.returnDate, {
        excludeReservationId: reservation.id,
      });
      const available = line.item.quantity - (reserved.get(line.itemId) ?? 0);
      if (line.quantity > available) return { error: 'NO_STOCK' as const, available };
      await tx.uitleenReservationLine.update({
        where: { id: lineId },
        data: { lineStatus, adminNote: adminNote || null },
      });
      return { error: null, available };
    });
    if (outcome.error === 'NO_STOCK') {
      return {
        ok: false,
        error: `"${line.itemName}" past niet meer: er ${outcome.available === 1 ? 'is' : 'zijn'} er nog ${outcome.available} vrij in deze periode.`,
      };
    }
  } else {
    await prisma.uitleenReservationLine.update({
      where: { id: lineId },
      data: { lineStatus, adminNote: adminNote || null },
    });
  }

  // Wel een historiekregel, in tegenstelling tot het klaarzetten: dit verandert
  // wat het lid krijgt, en dat moet navolgbaar zijn.
  if (lineStatus !== line.lineStatus) {
    await writeAudit(prisma, { reservationId: reservation.id }, {
      kind: 'EDITED',
      note:
        lineStatus === 'REJECTED'
          ? `Niet toegekend: ${line.quantity}× ${line.itemName}${adminNote ? ` (${adminNote})` : ''}`
          : `Toch toegekend: ${line.quantity}× ${line.itemName}`,
      actorId: session.user.id,
    });
  }

  revalidatePath(`/beheer/aanvragen/${reservation.id}`);
  revalidatePath('/beheer/aanvragen');
  revalidatePath(`/reservaties/${reservation.id}`);
  revalidatePath('/reservaties');
  return { ok: true, message: lineStatus === 'REJECTED' ? 'Lijn niet toegekend.' : 'Opgeslagen.' };
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
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'APPROVED',
    toStatus: 'PICKED_UP',
    actorId: session.user.id,
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
      // Oudste lading eerst; het item houdt de som en de eerstvolgende datum bij.
      if (consumed > 0) await consumeFlesserkeStock(tx, line.flesserkeItemId, consumed);
    }
    await writeAudit(tx, { reservationId }, {
      kind: 'STATUS_CHANGED',
      fromStatus: 'PICKED_UP',
      toStatus: 'RETURNED',
      actorId: session.user.id,
    });
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
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.paidOfflineAt) return { ok: false, error: 'Al gemarkeerd als betaald.' };

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { paidOfflineAt: new Date() },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaald aan de balie',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als betaald.' };
}

export async function markDepositReturnedAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'RETURNED') {
    return { ok: false, error: 'De waarborg gaat pas terug nadat alles teruggebracht is.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { depositReturnedAt: new Date() },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'waarborg teruggegeven',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Waarborg gemarkeerd als teruggegeven.' };
}

// ---------------------------------------------------------------------------
// Bulk-acties (N4): meerdere aanvragen tegelijk als afgehaald of teruggebracht
// markeren vanuit /beheer/aanvragen, zonder ze één voor één te moeten openen.
//
// Elke aanvraag doorloopt hier exact dezelfde overgang als bij een individuele
// aanvraag (`markPickedUpAction` / `markReturnedAction` hierboven): dezelfde
// statusguard, dezelfde voorraadtransactie per aanvraag.
//
// Eén aanvraag die de overgang niet kan maken (verkeerde status, ondertussen
// een conflict) is een verwachte invoerfout en blokkeert de rest van de batch
// niet: we verwerken wat kan en melden hoeveel er gelukt zijn.
// ---------------------------------------------------------------------------

export type BulkActionResult = {
  ok: boolean;
  succeeded: number;
  failed: number;
  /** Overgeslagen omdat de bulk-actie ze niet veilig kan verwerken (zie `bulkMarkReturnedAction`). */
  skipped: number;
  message: string;
};

function bulkMessage(verb: string, succeeded: number, failed: number, skipped: number): string {
  const total = succeeded + failed + skipped;
  const parts: string[] = [];
  parts.push(
    failed === 0 && skipped === 0
      ? succeeded === 1
        ? `1 aanvraag gemarkeerd als ${verb}`
        : `${succeeded} aanvragen gemarkeerd als ${verb}`
      : `${succeeded} van ${total} aanvragen gemarkeerd als ${verb}`
  );
  if (skipped > 0) {
    parts.push(
      `${skipped} bevat${skipped === 1 ? '' : 'ten'} flesserke en moet${
        skipped === 1 ? '' : 'en'
      } apart afgerekend worden`
    );
  }
  if (failed > 0) {
    parts.push(
      `${failed} kon${failed === 1 ? '' : 'den'} niet (verkeerde status of ondertussen gewijzigd)`
    );
  }
  return `${parts.join('; ')}.`;
}

export async function bulkMarkPickedUpAction(reservationIds: string[]): Promise<BulkActionResult> {
  await requireManage();
  if (reservationIds.length === 0) {
    return { ok: false, succeeded: 0, failed: 0, skipped: 0, message: 'Geen aanvragen geselecteerd.' };
  }
  let succeeded = 0;
  let failed = 0;
  for (const id of reservationIds) {
    const result = await markPickedUpAction(id);
    if (result.ok) succeeded += 1;
    else failed += 1;
  }
  return {
    ok: succeeded > 0,
    succeeded,
    failed,
    skipped: 0,
    message: bulkMessage('afgehaald', succeeded, failed, 0),
  };
}

/**
 * `markReturnedAction` zonder een `flesserkeReturned`-kaart boekt élke
 * flesserke-lijn af als volledig verbruikt (zie de doc-comment daar): prima
 * als bewuste keuze op één aanvraag, maar een stille voorraadfout wanneer het
 * per ongeluk gebeurt op vijf aanvragen tegelijk, en terugdraaien is precies
 * de bewerking waarvan het team zelf zegt dat de tekst erover onbegrijpelijk
 * is (F2). Een aanvraag met flesserke-lijnen slaan we hier daarom over in
 * plaats van te gokken: die blijft op "Afgehaald" staan en moet apart, via de
 * individuele aanvraag, afgerekend worden.
 */
export async function bulkMarkReturnedAction(reservationIds: string[]): Promise<BulkActionResult> {
  await requireManage();
  if (reservationIds.length === 0) {
    return { ok: false, succeeded: 0, failed: 0, skipped: 0, message: 'Geen aanvragen geselecteerd.' };
  }

  const withFlesserke = await prisma.uitleenReservation.findMany({
    where: { id: { in: reservationIds }, flesserkeLines: { some: {} } },
    select: { id: true },
  });
  const skipIds = new Set(withFlesserke.map((r) => r.id));
  const skipped = skipIds.size;

  let succeeded = 0;
  let failed = 0;
  for (const id of reservationIds) {
    if (skipIds.has(id)) continue;
    const result = await markReturnedAction(id);
    if (result.ok) succeeded += 1;
    else failed += 1;
  }
  return {
    ok: succeeded > 0,
    succeeded,
    failed,
    skipped,
    message: bulkMessage('teruggebracht', succeeded, failed, skipped),
  };
}
