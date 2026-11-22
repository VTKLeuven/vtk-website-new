import { resolveAuthorizedTicket } from "@/lib/ticketing/ticketAccess";
import { generateTicketsPdf } from "@/lib/ticketing/pdf";
import { isTicketPdfVariant } from "@/lib/ticketing/design";
import { ticketPdfBanner } from "@/lib/ticketing/pdfBanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const resolved = await resolveAuthorizedTicket(ticketId, new URL(request.url).searchParams.get("t"));
  if (!resolved) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const { ticket, order } = resolved;
  // `?variant=print`: de printversie voor een zwart-witprinter. Al de rest is
  // de kleurversie, ook een onbekende waarde.
  const requested = new URL(request.url).searchParams.get("variant");
  const variant = isTicketPdfVariant(requested) ? requested : "colour";

  const locale = order.locale === "EN" ? "en-GB" : "nl-BE";
  const pdf = await generateTicketsPdf({
    orderNumber: order.reference,
    currency: order.currency,
    locale: order.locale === "EN" ? "en" : "nl",
    variant,
    event: {
      title: order.locale === "EN" && ticket.event.titleEn ? ticket.event.titleEn : ticket.event.titleNl,
      startsAt: ticket.event.startsAt,
      location: ticket.event.location,
      banner: variant === "colour" ? await ticketPdfBanner(ticket.event.id) : null,
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
  const filename = `${ticket.event.slug}-${ticket.publicCode}${variant === "print" ? "-print" : ""}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "-");
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
