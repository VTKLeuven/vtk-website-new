import "server-only";

import { prisma } from "@vtk/db";
import { attendeeGroupsFor } from "./attendeeAccounts";
import type { RecipientCandidate } from "./attendeeRecipients";

/**
 * Alle deelnemers met een geldig ticket voor dit event, met hun groep, als
 * kandidaten voor `pickRecipients`. Eén rij per ticket; het ontdubbelen per
 * adres gebeurt daar.
 */
export async function recipientCandidates(eventId: string): Promise<RecipientCandidate[]> {
  const items = await prisma.ticketOrderItem.findMany({
    where: { eventId, ticket: { is: { status: "VALID" } } },
    select: {
      id: true,
      orderId: true,
      ticketTypeId: true,
      attendeeName: true,
      attendeeEmail: true,
      rNumber: true,
      honoraryPrice: true,
      order: { select: { buyerUserId: true, buyerName: true, buyerEmail: true } },
    },
    orderBy: [{ attendeeName: "asc" }, { createdAt: "asc" }],
  });
  const groups = await attendeeGroupsFor(items);
  return items.map((item, index) => ({
    email: (item.attendeeEmail ?? item.order.buyerEmail).toLowerCase(),
    // Zonder eigen adres gaat de mail naar de koper, dus aan hem gericht.
    name: item.attendeeEmail ? item.attendeeName : item.order.buyerName,
    ticketTypeId: item.ticketTypeId,
    group: groups[index],
    orderId: item.orderId,
  }));
}
