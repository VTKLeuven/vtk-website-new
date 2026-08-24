import { createStyledVtkQrPng } from "@/lib/shortlink-qr";
import { createTicketCredential } from "@/lib/ticketing/crypto";
import { resolveAuthorizedTicket } from "@/lib/ticketing/ticketAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De QR blijft achter dezelfde ordercookie of gebruikerssessie als de PDF en
 * walletdownloads. We bouwen de credential server-side opnieuw op, zodat die
 * niet in een querystring of afbeeldings-URL terechtkomt.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await params;
  const resolved = await resolveAuthorizedTicket(ticketId);
  if (!resolved) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const { ticket } = resolved;
  const credential = createTicketCredential(ticket.publicCode, ticket.credentialVersion);
  const png = await createStyledVtkQrPng(credential);

  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="vtk-ticket-${ticket.publicCode}-qr.png"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
