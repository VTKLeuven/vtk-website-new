import "server-only";

import {
  commitReservedInventory,
  quantitiesByPool,
  reserveInventory,
  returnSoldInventory,
  TicketInventoryError,
} from "./inventory";
import { withSerializableTransaction } from "./transactions";

/** Waarom een ticket niet van type kon wisselen; het beheer vertaalt dit. */
export const CHANGE_TYPE_ERRORS = [
  "ATTENDEE_NOT_FOUND",
  "TICKET_NOT_VALID",
  "REFUND_ALREADY_REQUESTED",
  "TICKET_TYPE_NOT_FOUND",
  "SAME_TICKET_TYPE",
  "SOLD_OUT",
] as const;
export type ChangeTypeError = (typeof CHANGE_TYPE_ERRORS)[number];

/**
 * Een ticket upgraden of downgraden: het krijgt een ander tickettype van
 * hetzelfde event.
 *
 * **Enkel het type wisselt, het geld niet.** De deelnemer betaalde wat hij
 * betaalde (`unitPriceCents`, `totalCents` blijven staan), en een prijsverschil
 * regelt de organisator buiten de site: bijbetalen aan de toog, of een deel met
 * de hand terugstorten. Zo blijven de ontvangsten van het event kloppen met wat
 * er echt binnenkwam. Zie docs/design-decisions.md, "Tickets met de hand".
 *
 * Het ticket houdt zijn code en zijn QR: de scanner leest het type uit de
 * bestelregel, dus wat de deelnemer al op zijn telefoon heeft, blijft werken en
 * toont aan de deur het nieuwe type. Het neemt een plaats in de pot van het
 * nieuwe type (dezelfde soort plaats, lid of niet-lid) en geeft die in de oude
 * pot vrij. Zit de nieuwe pot vol, dan gebeurt er niets.
 *
 * Mag ook na het inchecken: een upgrade aan de deur (drank erbij) is net het
 * geval waarvoor dit bestaat.
 */
export async function changeTicketType(input: {
  eventId: string;
  orderItemId: string;
  ticketTypeId: string;
  actorUserId: string;
}): Promise<{ orderId: string; attendeeName: string; fromName: string; toName: string }> {
  try {
    return await withSerializableTransaction(async (tx) => {
      const found = await tx.ticketOrderItem.findFirst({
        where: { id: input.orderItemId, eventId: input.eventId },
        select: { orderId: true },
      });
      if (!found) throw new Error("ATTENDEE_NOT_FOUND");
      // Dezelfde vergrendeling als verwijderen en terugbetalen.
      await tx.$queryRaw`SELECT "id" FROM "TicketOrder" WHERE "id" = ${found.orderId} FOR UPDATE`;

      const item = await tx.ticketOrderItem.findUnique({
        where: { id: input.orderItemId },
        include: { ticket: true, order: { select: { locale: true } } },
      });
      if (!item?.ticket) throw new Error("ATTENDEE_NOT_FOUND");
      if (item.ticket.status !== "VALID") throw new Error("TICKET_NOT_VALID");
      if (item.ticketTypeId === input.ticketTypeId) throw new Error("SAME_TICKET_TYPE");
      const pendingRefund = await tx.ticketRefundItem.count({
        where: { orderItemId: item.id, refund: { status: { in: ["PENDING", "SUCCEEDED"] } } },
      });
      if (pendingRefund > 0) throw new Error("REFUND_ALREADY_REQUESTED");

      const type = await tx.ticketType.findFirst({
        where: { id: input.ticketTypeId, eventId: input.eventId, active: true },
        select: { id: true, code: true, nameNl: true, nameEn: true, inventoryPoolId: true },
      });
      if (!type) throw new Error("TICKET_TYPE_NOT_FOUND");

      if (type.inventoryPoolId !== item.inventoryPoolId) {
        const next = quantitiesByPool([{ inventoryPoolId: type.inventoryPoolId, memberSeat: item.memberSeat }]);
        await reserveInventory(tx, input.eventId, next);
        await commitReservedInventory(tx, input.eventId, next);
        await returnSoldInventory(tx, input.eventId, quantitiesByPool([item]));
      }

      const toName = item.order.locale === "EN" && type.nameEn ? type.nameEn : type.nameNl;
      await tx.ticketOrderItem.update({
        where: { id: item.id },
        data: {
          ticketTypeId: type.id,
          inventoryPoolId: type.inventoryPoolId,
          ticketTypeCode: type.code,
          ticketTypeName: toName,
        },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId: input.eventId,
          actorUserId: input.actorUserId,
          action: "TICKET_TYPE_CHANGED",
          entityType: "Ticket",
          entityId: item.ticket.id,
          metadata: {
            orderId: item.orderId,
            orderItemId: item.id,
            fromTicketTypeId: item.ticketTypeId,
            toTicketTypeId: type.id,
          },
        },
      });
      return {
        orderId: item.orderId,
        attendeeName: item.attendeeName,
        fromName: item.ticketTypeName,
        toName,
      };
    });
  } catch (error) {
    if (error instanceof TicketInventoryError && error.code === "SOLD_OUT") throw new Error("SOLD_OUT");
    throw error;
  }
}
