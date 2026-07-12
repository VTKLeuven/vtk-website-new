import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma, TicketStatus } from "@prisma/client";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  Mail,
  RotateCcw,
  ScanLine,
  Search,
  TicketCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { StatusBadge } from "@/components/ticketing/admin/StatusBadge";
import {
  formatDateTime,
  formatNumber,
  type AdminLocale,
} from "@/components/ticketing/admin/format";

const TICKET_STATUSES: TicketStatus[] = ["VALID", "VOID", "REFUNDED"];

function answerLabel(value: Prisma.JsonValue, locale: AdminLocale): string {
  if (value === null) return "—";
  if (typeof value === "boolean") {
    return value ? (locale === "nl" ? "Ja" : "Yes") : (locale === "nl" ? "Nee" : "No");
  }
  if (Array.isArray(value)) return value.map((item) => answerLabel(item, locale)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function TicketAttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<{ q?: string; ticketType?: string; attendance?: string }>;
}) {
  const [{ locale: localeParam, eventId }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  await requireTicketEventCapability(eventId, "VIEW_ATTENDEES");

  const query = filters.q?.trim() ?? "";
  const attendance = ["CHECKED_IN", "NOT_CHECKED_IN", ...TICKET_STATUSES].includes(filters.attendance ?? "")
    ? filters.attendance
    : "";
  const ticketTypes = await prisma.ticketType.findMany({
    where: { eventId },
    select: { id: true, nameNl: true, nameEn: true, active: true },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
  });
  const selectedTicketType = ticketTypes.some((type) => type.id === filters.ticketType)
    ? filters.ticketType
    : "";

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
  if (selectedTicketType) conditions.push({ ticketTypeId: selectedTicketType });
  if (attendance === "CHECKED_IN") {
    conditions.push({ ticket: { is: { status: "VALID", checkedInAt: { not: null } } } });
  } else if (attendance === "NOT_CHECKED_IN") {
    conditions.push({ ticket: { is: { status: "VALID", checkedInAt: null } } });
  } else if (TICKET_STATUSES.includes(attendance as TicketStatus)) {
    conditions.push({ ticket: { is: { status: attendance as TicketStatus } } });
  }

  const where: Prisma.TicketOrderItemWhereInput = { AND: conditions };
  const [attendees, issuedCount, validCount, checkedInCount, refundedCount] = await Promise.all([
    prisma.ticketOrderItem.findMany({
      where,
      include: {
        order: {
          select: { reference: true, buyerName: true, buyerEmail: true, status: true },
        },
        answers: { orderBy: { createdAt: "asc" } },
        ticket: {
          include: {
            checkedInBy: { select: { name: true } },
            scanLogs: {
              include: {
                gate: { select: { name: true } },
                scannerUser: { select: { name: true } },
              },
              orderBy: { scannedAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ attendeeName: "asc" }, { createdAt: "asc" }],
      take: 300,
    }),
    prisma.ticket.count({ where: { eventId } }),
    prisma.ticket.count({ where: { eventId, status: "VALID" } }),
    prisma.ticket.count({ where: { eventId, status: "VALID", checkedInAt: { not: null } } }),
    prisma.ticket.count({ where: { eventId, status: "REFUNDED" } }),
  ]);

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <h1>{locale === "nl" ? "Deelnemers" : "Attendees"}</h1>
          <p>
            {locale === "nl"
              ? "Uitgegeven tickets, antwoorden en aanwezigheid."
              : "Issued tickets, answers and attendance."}
          </p>
        </div>
        <Link className="ticket-admin-button" href={`/api/tickets/events/${eventId}/exports/attendees`}>
          <Download aria-hidden="true" size={15} />
          {locale === "nl" ? "Deelnemers CSV" : "Attendees CSV"}
        </Link>
      </div>

      <div className="ticket-admin-metrics">
        <AdminMetric icon={UsersRound} label={locale === "nl" ? "Uitgegeven" : "Issued"} value={formatNumber(issuedCount, locale)} />
        <AdminMetric icon={TicketCheck} label={locale === "nl" ? "Geldig" : "Valid"} value={formatNumber(validCount, locale)} tone={validCount > 0 ? "success" : "default"} />
        <AdminMetric icon={ScanLine} label={locale === "nl" ? "Aanwezig" : "Checked in"} value={formatNumber(checkedInCount, locale)} tone={checkedInCount > 0 ? "success" : "default"} />
        <AdminMetric icon={RotateCcw} label={locale === "nl" ? "Terugbetaald" : "Refunded"} value={formatNumber(refundedCount, locale)} />
      </div>

      <section className="ticket-admin-section ticket-admin-section-compact" aria-label={locale === "nl" ? "Deelnemers filteren" : "Filter attendees"}>
        <form className="ticket-admin-filterbar" method="get">
          <div className="ticket-admin-field ticket-admin-filter-search">
            <label htmlFor="attendee-search">{locale === "nl" ? "Zoeken" : "Search"}</label>
            <div className="ticket-admin-input-icon">
              <Search aria-hidden="true" size={16} />
              <input
                id="attendee-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder={locale === "nl" ? "Naam, e-mail, code of order" : "Name, email, code or order"}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="attendee-ticket-type">Tickettype</label>
            <select id="attendee-ticket-type" name="ticketType" defaultValue={selectedTicketType}>
              <option value="">{locale === "nl" ? "Alle tickettypes" : "All ticket types"}</option>
              {ticketTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {locale === "en" && type.nameEn ? type.nameEn : type.nameNl}{type.active ? "" : ` (${locale === "nl" ? "gearchiveerd" : "archived"})`}
                </option>
              ))}
            </select>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="attendee-status">Status</label>
            <select id="attendee-status" name="attendance" defaultValue={attendance}>
              <option value="">{locale === "nl" ? "Alle statussen" : "All statuses"}</option>
              <option value="CHECKED_IN">{locale === "nl" ? "Aanwezig" : "Checked in"}</option>
              <option value="NOT_CHECKED_IN">{locale === "nl" ? "Niet aanwezig" : "Not checked in"}</option>
              <option value="VALID">{locale === "nl" ? "Geldig" : "Valid"}</option>
              <option value="VOID">{locale === "nl" ? "Ongeldig" : "Void"}</option>
              <option value="REFUNDED">{locale === "nl" ? "Terugbetaald" : "Refunded"}</option>
            </select>
          </div>
          <button className="ticket-admin-button" type="submit">
            <Filter aria-hidden="true" size={15} />
            {locale === "nl" ? "Filter" : "Filter"}
          </button>
        </form>
      </section>

      <section className="ticket-admin-section" aria-labelledby="attendees-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="attendees-heading">{locale === "nl" ? "Deelnemerslijst" : "Attendee list"}</h2>
            <p>{formatNumber(attendees.length, locale)} {locale === "nl" ? "resultaten" : "results"}{attendees.length === 300 ? ` · ${locale === "nl" ? "maximaal 300" : "maximum 300"}` : ""}</p>
          </div>
        </div>
        {attendees.length === 0 ? (
          <AdminEmptyState
            icon={UserRound}
            title={locale === "nl" ? "Geen deelnemers gevonden" : "No attendees found"}
            description={locale === "nl" ? "Pas je zoekopdracht of filters aan." : "Adjust your search or filters."}
          />
        ) : (
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-admin-attendees-table">
              <thead>
                <tr>
                  <th>{locale === "nl" ? "Deelnemer" : "Attendee"}</th>
                  <th>Ticket</th>
                  <th>Status</th>
                  <th>{locale === "nl" ? "Aanwezigheid" : "Attendance"}</th>
                  <th data-priority="low">{locale === "nl" ? "Bestelling" : "Order"}</th>
                  <th><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {attendees.map((item) => {
                  const ticket = item.ticket;
                  if (!ticket) return null;
                  const latestScan = ticket.scanLogs[0];
                  return (
                    <tr key={item.id}>
                      <td data-wrap="true">
                        <strong>{item.attendeeName}</strong>
                        <div className="ticket-admin-row-meta ticket-admin-inline-meta">
                          <Mail aria-hidden="true" size={13} />
                          {item.attendeeEmail ?? item.order.buyerEmail}
                          {!item.attendeeEmail ? <span>({locale === "nl" ? "koper" : "buyer"})</span> : null}
                        </div>
                      </td>
                      <td data-wrap="true">
                        <strong>{item.ticketTypeName}</strong>
                        <div className="ticket-admin-row-meta ticket-admin-code">{ticket.publicCode}</div>
                      </td>
                      <td><StatusBadge status={ticket.status} locale={locale} /></td>
                      <td data-wrap="true">
                        {ticket.checkedInAt ? (
                          <span className="ticket-admin-checkin" data-checked="true">
                            <CheckCircle2 aria-hidden="true" size={15} />
                            <span>{formatDateTime(ticket.checkedInAt, locale)}</span>
                          </span>
                        ) : (
                          <span className="ticket-admin-row-meta">{locale === "nl" ? "Niet gescand" : "Not scanned"}</span>
                        )}
                      </td>
                      <td data-priority="low">
                        <span className="ticket-admin-code">{item.order.reference}</span>
                        <div className="ticket-admin-row-meta">{item.order.buyerName}</div>
                      </td>
                      <td className="ticket-admin-disclosure-cell">
                        <details className="ticket-admin-row-details">
                          <summary
                            className="ticket-admin-icon-button"
                            aria-label={`${locale === "nl" ? "Details van" : "Details for"} ${item.attendeeName}`}
                            title="Details"
                          >
                            <ChevronDown aria-hidden="true" size={17} />
                          </summary>
                          <div className="ticket-admin-row-details-panel ticket-admin-attendee-panel">
                            <div className="ticket-admin-detail-grid">
                              <div>
                                <h3>{locale === "nl" ? "Ticketgegevens" : "Ticket details"}</h3>
                                <dl className="ticket-admin-spec">
                                  <div><dt>{locale === "nl" ? "Uitgegeven" : "Issued"}</dt><dd>{formatDateTime(ticket.issuedAt, locale)}</dd></div>
                                  <div><dt>{locale === "nl" ? "Bestelling" : "Order"}</dt><dd className="ticket-admin-code">{item.order.reference}</dd></div>
                                  <div><dt>{locale === "nl" ? "Koper" : "Buyer"}</dt><dd>{item.order.buyerName} · {item.order.buyerEmail}</dd></div>
                                  <div><dt>{locale === "nl" ? "Ingecheckt door" : "Checked in by"}</dt><dd>{ticket.checkedInBy?.name ?? "—"}</dd></div>
                                </dl>
                              </div>
                              <div>
                                <h3>{locale === "nl" ? "Laatste scan" : "Latest scan"}</h3>
                                {latestScan ? (
                                  <dl className="ticket-admin-spec">
                                    <div><dt>{locale === "nl" ? "Resultaat" : "Result"}</dt><dd><StatusBadge status={latestScan.result} locale={locale} /></dd></div>
                                    <div><dt>{locale === "nl" ? "Tijdstip" : "Time"}</dt><dd>{formatDateTime(latestScan.scannedAt, locale)}</dd></div>
                                    <div><dt>{locale === "nl" ? "Poort" : "Gate"}</dt><dd>{latestScan.gate?.name ?? "—"}</dd></div>
                                    <div><dt>Scanner</dt><dd>{latestScan.scannerUser?.name ?? "—"}</dd></div>
                                  </dl>
                                ) : <p className="ticket-admin-empty-copy">{locale === "nl" ? "Nog geen scan geregistreerd." : "No scan registered yet."}</p>}
                              </div>
                            </div>
                            {item.answers.length > 0 ? (
                              <div className="ticket-admin-detail-section">
                                <h3>{locale === "nl" ? "Antwoorden" : "Answers"}</h3>
                                <dl className="ticket-admin-answer-list">
                                  {item.answers.map((answer) => (
                                    <div key={answer.id}>
                                      <dt>{answer.questionLabel}</dt>
                                      <dd>{answerLabel(answer.value, locale)}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
