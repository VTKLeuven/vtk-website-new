import 'server-only';

import { prisma } from '@vtk/db';
import type { CollectEnGoOrder } from '@prisma/client';
import type { ParsedCollectEnGoOrder } from './parse';

export type StoreSource = 'IMAP' | 'PASTE';

export type StoreResult = {
  /** `DUPLICATE`: deze mail zat er al in (zelfde Message-ID). */
  status: 'CREATED' | 'REPLACED' | 'DUPLICATE';
  order: CollectEnGoOrder;
};

/**
 * Een geparste bestelling bewaren.
 *
 * Drie gevallen, alle drie uit de praktijk:
 * - dezelfde mail komt een tweede keer binnen (IMAP-ronde na een herstart):
 *   herkend aan `messageId`, we laten ze liggen;
 * - Collect&Go stuurt een **wijziging** met hetzelfde reservatienummer terwijl de
 *   vorige nog niet geïmporteerd is: dan vervangt de nieuwe de oude, want de
 *   oude lijst klopt niet meer;
 * - het reservatienummer is al geïmporteerd: dan blijft die historiek staan en
 *   komt de nieuwe mail als een eigen rij binnen, met een waarschuwing in het
 *   beheer dat er meerdere mails voor dat nummer zijn.
 */
export async function storeParsedOrder(
  parsed: ParsedCollectEnGoOrder,
  input: { source: StoreSource; messageId?: string | null; receivedAt?: Date }
): Promise<StoreResult> {
  const messageId = input.messageId?.trim() || null;
  if (messageId) {
    const existing = await prisma.collectEnGoOrder.findUnique({ where: { messageId } });
    if (existing) return { status: 'DUPLICATE', order: existing };
  }

  const scalars = {
    reservationNumber: parsed.reservationNumber,
    customerName: parsed.customerName,
    pickupPoint: parsed.pickupPoint,
    pickupFrom: parsed.pickupFrom,
    pickupUntil: parsed.pickupUntil,
    orderedAt: parsed.orderedAt,
    subtotalCents: parsed.subtotalCents,
    discountCents: parsed.discountCents,
    serviceCostCents: parsed.serviceCostCents,
    totalCents: parsed.totalCents,
    rawText: parsed.rawText,
    source: input.source,
    messageId,
    receivedAt: input.receivedAt ?? new Date(),
  };
  const lineCreates = parsed.lines.map((line) => ({
    sortIndex: line.sortIndex,
    category: line.category,
    productName: line.productName,
    note: line.note,
    unit: line.unit,
    quantity: line.quantity,
    quantityText: line.quantityText,
    unitPriceCents: line.unitPriceCents,
    unitPriceBasis: line.unitPriceBasis,
    totalPriceCents: line.totalPriceCents,
    depositCents: line.depositCents,
    lineDiscountCents: line.lineDiscountCents,
  }));

  const open = await prisma.collectEnGoOrder.findFirst({
    where: { reservationNumber: parsed.reservationNumber, status: 'NEW' },
    orderBy: { receivedAt: 'desc' },
  });

  if (open) {
    const order = await prisma.$transaction(async (tx) => {
      await tx.collectEnGoOrderLine.deleteMany({ where: { orderId: open.id } });
      return tx.collectEnGoOrder.update({
        where: { id: open.id },
        data: { ...scalars, lines: { create: lineCreates } },
      });
    });
    return { status: 'REPLACED', order };
  }

  const order = await prisma.collectEnGoOrder.create({
    data: { ...scalars, lines: { create: lineCreates } },
  });
  return { status: 'CREATED', order };
}
