import type { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "@vtk/db";
import { createCsv, type CsvValue } from "@/lib/ticketing/csv";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";

const TICKET_STATUSES: TicketStatus[] = ["VALID", "VOID", "REFUNDED"];
const MAX_EXPORT_ROWS = 50_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "tickets";
}

function errorResponse(error: unknown): Response {
  const code = error instanceof Error ? error.message : "EXPORT_FAILED";
  if (code === "UNAUTHENTICATED") return Response.json({ error: code }, { status: 401 });
  if (code === "FORBIDDEN") return Response.json({ error: code }, { status: 403 });
  if (code === "TICKET_EVENT_NOT_FOUND") return Response.json({ error: code }, { status: 404 });
  console.error("Ticket attendee export failed", error);
  return Response.json({ error: "EXPORT_FAILED" }, { status: 500 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { event } = await requireTicketEventCapability(eventId, "VIEW_ATTENDEES");
    const search = new URL(request.url).searchParams;
    const query = search.get("q")?.trim().slice(0, 200) ?? "";
    const ticketTypeId = search.get("ticketType")?.trim() ?? "";
    const rawAttendance = search.get("attendance") ?? "";
    const attendance = ["CHECKED_IN", "NOT_CHECKED_IN", ...TICKET_STATUSES].includes(rawAttendance)
      ? rawAttendance
      : "";
    const locale = search.get("locale") === "en" ? "en" : "nl";

    const conditions: Prisma.TicketOrderItemWhereInput[] = [
      { eventId },
      { ticket: { isNot: null } },
    ];
    if (query) {
      conditions.push({
        OR: [
          { attendeeName: { contains: query, mode: "insensitive" } },
          { attendeeEmail: { contains: query, mode: "insensitive" } },
          { ticketTypeName: { contains: query, mode: "insensitive" } },
          { order: { reference: { contains: query, mode: "insensitive" } } },
          { order: { buyerName: { contains: query, mode: "insensitive" } } },
          { order: { buyerEmail: { contains: query, mode: "insensitive" } } },
          { ticket: { is: { publicCode: { contains: query, mode: "insensitive" } } } },
        ],
      });
    }
    if (ticketTypeId) {
      const belongsToEvent = await prisma.ticketType.count({ where: { id: ticketTypeId, eventId } });
      if (belongsToEvent) conditions.push({ ticketTypeId });
    }
    if (attendance === "CHECKED_IN") {
      conditions.push({ ticket: { is: { status: "VALID", checkedInAt: { not: null } } } });
    } else if (attendance === "NOT_CHECKED_IN") {
      conditions.push({ ticket: { is: { status: "VALID", checkedInAt: null } } });
    } else if (TICKET_STATUSES.includes(attendance as TicketStatus)) {
      conditions.push({ ticket: { is: { status: attendance as TicketStatus } } });
    }

    const [questions, items] = await Promise.all([
      prisma.ticketQuestion.findMany({
        where: { eventId },
        select: { id: true, code: true, labelNl: true, labelEn: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.ticketOrderItem.findMany({
        where: { AND: conditions },
        include: {
          order: { select: { reference: true, buyerName: true, buyerEmail: true, status: true, createdAt: true } },
          ticket: { select: { publicCode: true, status: true, checkedInAt: true } },
          answers: { select: { questionId: true, value: true } },
        },
        orderBy: [{ attendeeName: "asc" }, { createdAt: "asc" }],
        take: MAX_EXPORT_ROWS + 1,
      }),
    ]);

    if (items.length > MAX_EXPORT_ROWS) {
      return Response.json({ error: "EXPORT_TOO_LARGE", limit: MAX_EXPORT_ROWS }, { status: 413 });
    }

    const headers = [
      locale === "nl" ? "Ticketcode" : "Ticket code",
      locale === "nl" ? "Deelnemer" : "Attendee",
      locale === "nl" ? "E-mail deelnemer" : "Attendee email",
      locale === "nl" ? "Tickettype" : "Ticket type",
      locale === "nl" ? "Ticketstatus" : "Ticket status",
      locale === "nl" ? "Ingecheckt op" : "Checked in at",
      locale === "nl" ? "Koper" : "Buyer",
      locale === "nl" ? "E-mail koper" : "Buyer email",
      locale === "nl" ? "Bestelling" : "Order",
      locale === "nl" ? "Bestelstatus" : "Order status",
      locale === "nl" ? "Besteld op" : "Ordered at",
      ...questions.map((question) =>
        `${locale === "nl" ? "Vraag" : "Question"}: ${locale === "en" && question.labelEn ? question.labelEn : question.labelNl} [${question.code}]`
      ),
    ];
    const rows: CsvValue[][] = items.map((item) => {
      const answers = new Map(item.answers.map((answer) => [answer.questionId, answer.value]));
      return [
        item.ticket?.publicCode,
        item.attendeeName,
        item.attendeeEmail,
        item.ticketTypeName,
        item.ticket?.status,
        item.ticket?.checkedInAt,
        item.order.buyerName,
        item.order.buyerEmail,
        item.order.reference,
        item.order.status,
        item.order.createdAt,
        ...questions.map((question) => {
          const answer = answers.get(question.id);
          if (Array.isArray(answer)) return answer.map(String).join("; ");
          if (answer != null && typeof answer === "object") return JSON.stringify(answer);
          return answer == null ? null : String(answer);
        }),
      ];
    });

    return new Response(createCsv(headers, rows), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(event.slug)}-${locale === "nl" ? "deelnemers" : "attendees"}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
