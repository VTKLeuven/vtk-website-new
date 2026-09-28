import { prisma } from "@vtk/db";
import { createStyledVtkQrPng } from "@/lib/shortlink-qr";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { createTicketCredential } from "@/lib/ticketing/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dezelfde QR als op het ticket van de deelnemer, maar achter het beheer.
 *
 * `/api/tickets/[ticketId]/qr` hangt aan de ordercookie of aan de koper zelf, en
 * dat is precies de bedoeling: die route hoort bij het ticket van iemand anders.
 * Wie het deelnemerstabblad mag zien, moet de code alsnog op een scherm kunnen
 * krijgen, want zonder een echte QR is de scanner enkel te proberen door zelf een
 * bestelling na te spelen.
 *
 * `VIEW_ATTENDEES` geeft hier niets nieuws weg. Die capability toont de
 * deelnemerslijst mét `publicCode`, en de scanner aanvaardt zo'n code ook
 * handmatig ingetikt (versie 0); de QR maakt dat enkel sneller. De query is op
 * `eventId` én `id` gezet, zodat een beheerder van het ene event geen ticket van
 * het andere kan laten tekenen.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; ticketId: string }> }
) {
  try {
    const { eventId, ticketId } = await params;
    await requireTicketEventCapability(eventId, "VIEW_ATTENDEES");

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, eventId },
      select: { publicCode: true, credentialVersion: true },
    });
    if (!ticket) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const png = await createStyledVtkQrPng(
      createTicketCredential(ticket.publicCode, ticket.credentialVersion)
    );

    return new Response(Buffer.from(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="vtk-ticket-${ticket.publicCode}-qr.png"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOT_FOUND";
    if (code === "UNAUTHENTICATED") return Response.json({ error: code }, { status: 401 });
    if (code === "FORBIDDEN") return Response.json({ error: code }, { status: 403 });
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
