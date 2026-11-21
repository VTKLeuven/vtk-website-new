import "server-only";

import { quantitiesByPool, returnSoldInventory } from "./inventory";
import { withSerializableTransaction } from "./transactions";

/**
 * Eén ticket intrekken zonder terugbetaling: het werkt niet meer aan de ingang
 * (`VOID`, de scanner weigert het) en zijn plaats komt terug vrij in de pot.
 * De andere tickets van dezelfde bestelling blijven geldig, en de bestelling
 * zelf blijft betaald: er gaat geen geld terug.
 *
 * Bedoeld voor een ticket dat er niet had mogen zijn, zoals een voorverkoop-
 * ticket dat iemand voor een ander kocht. Moet het geld wel terug, dan loopt
 * dat langs `requestTicketRefund`; die trekt het ticket op dezelfde manier in.
 * Een ticket dat hier ingetrokken is, kan daarna niet meer via het systeem
 * terugbetaald worden (`requestTicketRefund` vraagt een geldig ticket).
 */
export async function voidTicketWithoutRefund(input: {
  eventId: string;
  orderItemId: string;
  actorUserId: string;
}): Promise<{ orderId: string; attendeeName: string }> {
  return withSerializableTransaction(async (tx) => {
    const item = await tx.ticketOrderItem.findFirst({
      where: { id: input.orderItemId, eventId: input.eventId },
      select: { orderId: true },
    });
    if (!item) throw new Error("ATTENDEE_NOT_FOUND");
    // Dezelfde vergrendeling als een terugbetaling, zodat die twee niet
    // tegelijk aan hetzelfde ticket kunnen.
    await tx.$queryRaw`SELECT "id" FROM "TicketOrder" WHERE "id" = ${item.orderId} FOR UPDATE`;

    const orderItem = await tx.ticketOrderItem.findUnique({
      where: { id: input.orderItemId },
      include: { ticket: true },
    });
    if (!orderItem?.ticket) throw new Error("ATTENDEE_NOT_FOUND");
    if (orderItem.ticket.status !== "VALID") throw new Error("TICKET_NOT_VALID");
    if (orderItem.ticket.checkedInAt) throw new Error("TICKET_ALREADY_CHECKED_IN");
    const pendingRefund = await tx.ticketRefundItem.count({
      where: {
        orderItemId: orderItem.id,
        refund: { status: { in: ["PENDING", "SUCCEEDED"] } },
      },
    });
    if (pendingRefund > 0) throw new Error("REFUND_ALREADY_REQUESTED");

    const changed = await tx.$executeRaw`
      UPDATE "Ticket"
      SET "status" = 'VOID'::"TicketStatus", "voidedAt" = NOW()
      WHERE "id" = ${orderItem.ticket.id}
        AND "eventId" = ${input.eventId}
        AND "status" = 'VALID'::"TicketStatus"
        AND "checkedInAt" IS NULL
    `;
    if (changed !== 1) throw new Error("TICKET_NOT_VALID");
    await returnSoldInventory(tx, input.eventId, quantitiesByPool([orderItem]));
    await tx.ticketAuditLog.create({
      data: {
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        action: "TICKET_VOIDED",
        entityType: "Ticket",
        entityId: orderItem.ticket.id,
        // Bewust zonder de reden uit de mail: dit logboek overleeft het
        // archiveren van het event, en die vrije tekst noemt vaak mensen.
        metadata: { orderId: orderItem.orderId, orderItemId: orderItem.id, refunded: false },
      },
    });
    return { orderId: orderItem.orderId, attendeeName: orderItem.attendeeName };
  });
}
