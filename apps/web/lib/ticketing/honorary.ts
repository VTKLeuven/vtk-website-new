import type { Prisma } from "@prisma/client";

/**
 * De bestelregels die een erelid voor dit event nog heeft. Een vervallen
 * bestelling of een terugbetaald ticket telt niet meer, een bestelling die nog
 * op betaling wacht wel.
 *
 * Eén bron voor de checkout en de shop, voor beide grenzen: één ticket aan de
 * ereledenprijs (met `honoraryPrice: true` erbij) en één ticket in totaal
 * (`TicketEvent.honoraryOneTicket`). Zo laat de shop niets kiezen wat de
 * checkout daarna weigert.
 */
export function honoraryHeldTicketsWhere(
  eventId: string,
  userId: string,
): Prisma.TicketOrderItemWhereInput {
  return {
    eventId,
    order: {
      buyerUserId: userId,
      status: { in: ["PENDING_PAYMENT", "PAID", "PARTIALLY_REFUNDED"] },
    },
    OR: [{ ticket: null }, { ticket: { status: { not: "REFUNDED" } } }],
  };
}
