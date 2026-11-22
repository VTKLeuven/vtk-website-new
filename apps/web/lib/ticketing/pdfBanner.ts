import "server-only";

import { prisma } from "@vtk/db";
import { ticketPosterImage, ticketPosterSelect } from "./poster";
import type { TicketPdfBanner } from "./pdf";

/**
 * De banner van het ticketevent voor de kleurversie van de PDF: dezelfde als in
 * de shop en op /tickets (`ticketPosterImage`). Een affiche in het ticketontwerp
 * wint daarvan; zonder beide tekent de PDF het navy vlak.
 *
 * Bewust niet in de momentopname van het ticket: de banner is die van het
 * event, en wie ze daar aanpast, ziet ze ook op een al uitgegeven ticket.
 */
export async function ticketPdfBanner(eventId: string): Promise<TicketPdfBanner | null> {
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId }, select: ticketPosterSelect });
  const image = event ? ticketPosterImage(event) : null;
  return image ? { key: image.key, focalX: image.focus.x * 100, focalY: image.focus.y * 100 } : null;
}
