import type { Prisma } from "@prisma/client";
import type { WalletTicketInput } from "./types";

type ResolvedTicket = Prisma.TicketGetPayload<{
  include: { event: true; orderItem: { include: { order: true } } };
}>;

/** Same shape the PDF route builds from a resolved ticket; wallet passes and
 * the PDF are two renderers over the same underlying data. */
export function walletInputFromTicket(ticket: ResolvedTicket): WalletTicketInput {
  const order = ticket.orderItem.order;
  return {
    ticketId: ticket.id,
    publicId: ticket.publicCode,
    qrVersion: ticket.credentialVersion,
    attendeeName: ticket.orderItem.attendeeName,
    typeName: ticket.orderItem.ticketTypeName,
    unitPriceCents: ticket.orderItem.totalCents,
    status: ticket.status,
    designSnapshot: ticket.designSnapshot,
    event: {
      id: ticket.event.id,
      title: order.locale === "EN" && ticket.event.titleEn ? ticket.event.titleEn : ticket.event.titleNl,
      startsAt: ticket.event.startsAt,
      location: ticket.event.location,
    },
    orderNumber: order.reference,
    currency: order.currency,
  };
}
