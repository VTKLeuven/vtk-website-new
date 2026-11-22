import type { Prisma } from "@prisma/client";

/**
 * De bestelregels die één account voor dit event nog heeft. Een vervallen
 * bestelling of een terugbetaald ticket telt niet meer, een bestelling die nog
 * op betaling wacht wel.
 *
 * Eén bron voor de checkout en de shop, voor alle drie de per-accountgrenzen:
 * één ticket aan de ereledenprijs (met `honoraryPrice: true` erbij), één ticket
 * in totaal voor een erelid (`TicketEvent.honoraryOneTicket`), en het maximum
 * per account (`TicketEvent.maxTicketsPerAccount`, of 1 tijdens voorverkoop).
 * Zo laat de shop niets kiezen wat de checkout daarna weigert.
 */
export function accountHeldTicketsWhere(
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

/** Alias voor bestaande aanroepers rond het erelidticket. */
export const honoraryHeldTicketsWhere = accountHeldTicketsWhere;
