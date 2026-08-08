import { resolveAuthorizedTicket } from "@/lib/ticketing/ticketAccess";
import { generateTicketsPdf } from "@/lib/ticketing/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const resolved = await resolveAuthorizedTicket(ticketId);
  if (!resolved) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const { ticket, order } = resolved;

  const locale = order.locale === "EN" ? "en-GB" : "nl-BE";
  const pdf = await generateTicketsPdf({
    orderNumber: order.reference,
    currency: order.currency,
    event: {
      title: order.locale === "EN" && ticket.event.titleEn ? ticket.event.titleEn : ticket.event.titleNl,
      startsAt: ticket.event.startsAt,
      location: ticket.event.location,
    },
    tickets: [
      {
        publicId: ticket.publicCode,
        qrVersion: ticket.credentialVersion,
        attendeeName: ticket.orderItem.attendeeName,
        typeName: ticket.orderItem.ticketTypeName,
        unitPriceCents: ticket.orderItem.totalCents,
        status: ticket.status,
        designSnapshot: ticket.designSnapshot,
      },
    ],
  });
  const filename = `${ticket.event.slug}-${ticket.publicCode}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Language": locale,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
