import { generateTicketsPdf } from "@/lib/ticketing/pdf";
import { parseTicketDesignDraft } from "@/lib/ticketing/design";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { event } = await requireTicketEventCapability(eventId, "MANAGE_EVENT");
    const body = await readLimitedJson(request, 32 * 1024);
    const design = parseTicketDesignDraft(body, eventId);
    const pdf = await generateTicketsPdf({
      orderNumber: "VOORBEELD-A4",
      currency: event.currency,
      event: {
        id: event.id,
        title: event.titleNl,
        startsAt: event.startsAt,
        location: event.location,
      },
      tickets: [{
        publicId: "voorbeeld-ticket",
        qrVersion: 1,
        attendeeName: "Alex Voorbeeld",
        typeName: "Standaardticket",
        unitPriceCents: 1_500,
        status: "VALID",
        designSnapshot: { ...design, revision: 0, publishedAt: new Date().toISOString() },
      }],
    });
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="ticket-ontwerp-voorbeeld.pdf"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_TICKET_DESIGN";
    const status = code === "UNAUTHENTICATED" ? 401
      : code === "FORBIDDEN" ? 403
      : code === "TICKET_EVENT_NOT_FOUND" ? 404
      : error instanceof RequestBodyTooLargeError ? 413
      : 400;
    return Response.json({ error: code }, { status });
  }
}
