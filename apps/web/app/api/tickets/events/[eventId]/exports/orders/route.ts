import type { Prisma, TicketOrderStatus } from "@prisma/client";
import { prisma } from "@vtk/db";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { createCsv, type CsvValue } from "@/lib/ticketing/csv";

const ORDER_STATUSES: TicketOrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PAYMENT_FAILED",
  "EXPIRED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
];
const MAX_EXPORT_ROWS = 50_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "tickets";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { event } = await requireTicketEventCapability(eventId, "VIEW_FINANCE");
    const search = new URL(request.url).searchParams;
    const query = search.get("q")?.trim().slice(0, 200) ?? "";
    const rawStatus = search.get("status") ?? "";
    const status = ORDER_STATUSES.includes(rawStatus as TicketOrderStatus)
      ? (rawStatus as TicketOrderStatus)
      : undefined;
    const locale = search.get("locale") === "en" ? "en" : "nl";
    const where: Prisma.TicketOrderWhereInput = {
      eventId,
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { reference: { contains: query, mode: "insensitive" } },
              { buyerName: { contains: query, mode: "insensitive" } },
              { buyerEmail: { contains: query, mode: "insensitive" } },
              { items: { some: { attendeeName: { contains: query, mode: "insensitive" } } } },
              { items: { some: { attendeeEmail: { contains: query, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const orders = await prisma.ticketOrder.findMany({
      where,
      include: {
        items: { select: { id: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS + 1,
    });
    if (orders.length > MAX_EXPORT_ROWS) {
      return Response.json({ error: "EXPORT_TOO_LARGE", limit: MAX_EXPORT_ROWS }, { status: 413 });
    }

    const headers = locale === "nl"
      ? ["Referentie", "Koper", "E-mail koper", "Status", "Tickets", "Totaal (cent)", "Terugbetaald (cent)", "Netto (cent)", "Munt", "Betaalprovider", "Betaalstatus", "Betaald op", "Aangemaakt op"]
      : ["Reference", "Buyer", "Buyer email", "Status", "Tickets", "Total (cents)", "Refunded (cents)", "Net (cents)", "Currency", "Payment provider", "Payment status", "Paid at", "Created at"];
    const rows: CsvValue[][] = orders.map((order) => {
      const payment = order.payments[0];
      return [
        order.reference,
        order.buyerName,
        order.buyerEmail,
        order.status,
        order.items.length,
        order.totalCents,
        order.refundedCents,
        order.totalCents - order.refundedCents,
        order.currency,
        payment?.provider,
        payment?.status,
        order.paidAt,
        order.createdAt,
      ];
    });

    return new Response(createCsv(headers, rows), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(event.slug)}-${locale === "nl" ? "bestellingen" : "orders"}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPORT_FAILED";
    if (code === "UNAUTHENTICATED") return Response.json({ error: code }, { status: 401 });
    if (code === "FORBIDDEN") return Response.json({ error: code }, { status: 403 });
    if (code === "TICKET_EVENT_NOT_FOUND") return Response.json({ error: code }, { status: 404 });
    console.error("Ticket order export failed", error);
    return Response.json({ error: "EXPORT_FAILED" }, { status: 500 });
  }
}
