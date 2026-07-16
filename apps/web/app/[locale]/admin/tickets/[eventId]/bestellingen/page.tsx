import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma, TicketOrderStatus } from "@prisma/client";
import {
  ChevronDown,
  CircleDollarSign,
  Download,
  Filter,
  MailPlus,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  Timer,
} from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { resendTicketOrderConfirmationAction } from "@/app/actions/tickets";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { RefundOrderForm } from "@/components/ticketing/admin/RefundOrderForm";
import { StatusBadge } from "@/components/ticketing/admin/StatusBadge";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  statusLabel,
  type AdminLocale,
} from "@/components/ticketing/admin/format";

const ORDER_STATUSES: TicketOrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PAYMENT_FAILED",
  "EXPIRED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
];

export default async function TicketOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const [{ locale: localeParam, eventId }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { event, capabilities } = await requireTicketEventCapability(eventId, "VIEW_EVENT");
  const canManageOrders = capabilities.includes("MANAGE_ORDERS");
  const canViewFinance = capabilities.includes("VIEW_FINANCE");
  if (!canManageOrders && !canViewFinance) throw new Error("FORBIDDEN");
  const canRefund = capabilities.includes("REFUND");
  const query = filters.q?.trim() ?? "";
  const status = ORDER_STATUSES.includes(filters.status as TicketOrderStatus)
    ? (filters.status as TicketOrderStatus)
    : undefined;

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

  const [orders, totalOrders, paidOrders, pendingOrders, refundedOrders, totals] = await Promise.all([
    prisma.ticketOrder.findMany({
      where,
      include: {
        items: {
          include: {
            ticket: true,
            refundItems: {
              where: { refund: { status: { in: ["PENDING", "SUCCEEDED"] } } },
              select: { id: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        refunds: {
          include: { _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.ticketOrder.count({ where: { eventId } }),
    prisma.ticketOrder.count({
      where: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    }),
    prisma.ticketOrder.count({ where: { eventId, status: "PENDING_PAYMENT" } }),
    prisma.ticketOrder.count({
      where: { eventId, status: { in: ["PARTIALLY_REFUNDED", "REFUNDED"] } },
    }),
    canViewFinance
      ? prisma.ticketOrder.aggregate({
          where: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
          _sum: { totalCents: true, refundedCents: true },
        })
      : Promise.resolve(null),
  ]);
  const net = totals ? (totals._sum.totalCents ?? 0) - (totals._sum.refundedCents ?? 0) : 0;

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <h1>{locale === "nl" ? "Bestellingen" : "Orders"}</h1>
          <p>
            {locale === "nl"
              ? "Betalingen, tickets en terugbetalingen per bestelling."
              : "Payments, tickets and refunds for each order."}
          </p>
        </div>
        <Link className="ticket-admin-button" href={`/api/tickets/events/${eventId}/exports/orders`}>
          <Download aria-hidden="true" size={15} />
          {locale === "nl" ? "Orders CSV" : "Orders CSV"}
        </Link>
      </div>

      <div className="ticket-admin-metrics">
        <AdminMetric icon={ShoppingCart} label={locale === "nl" ? "Totaal" : "Total"} value={formatNumber(totalOrders, locale)} />
        <AdminMetric icon={ReceiptText} label={locale === "nl" ? "Betaald" : "Paid"} value={formatNumber(paidOrders, locale)} tone={paidOrders > 0 ? "success" : "default"} />
        <AdminMetric icon={Timer} label={locale === "nl" ? "Openstaand" : "Pending"} value={formatNumber(pendingOrders, locale)} tone={pendingOrders > 0 ? "warning" : "default"} />
        <AdminMetric
          icon={canViewFinance ? CircleDollarSign : RotateCcw}
          label={canViewFinance ? (locale === "nl" ? "Netto-omzet" : "Net revenue") : (locale === "nl" ? "Terugbetaald" : "Refunded")}
          value={canViewFinance ? formatMoney(net, event.currency, locale) : formatNumber(refundedOrders, locale)}
        />
      </div>

      <section className="ticket-admin-section ticket-admin-section-compact" aria-label={locale === "nl" ? "Bestellingen filteren" : "Filter orders"}>
        <form className="ticket-admin-filterbar" method="get">
          <div className="ticket-admin-field ticket-admin-filter-search">
            <label htmlFor="order-search">{locale === "nl" ? "Zoeken" : "Search"}</label>
            <div className="ticket-admin-input-icon">
              <Search aria-hidden="true" size={16} />
              <input
                id="order-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder={locale === "nl" ? "Referentie, naam of e-mail" : "Reference, name or email"}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="order-status">Status</label>
            <select id="order-status" name="status" defaultValue={status ?? ""}>
              <option value="">{locale === "nl" ? "Alle statussen" : "All statuses"}</option>
              {ORDER_STATUSES.map((option) => (
                <option key={option} value={option}>{statusLabel(option, locale)}</option>
              ))}
            </select>
          </div>
          <button className="ticket-admin-button" type="submit">
            <Filter aria-hidden="true" size={15} />
            {locale === "nl" ? "Filter" : "Filter"}
          </button>
        </form>
      </section>

      <section className="ticket-admin-section" aria-labelledby="orders-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="orders-heading">{locale === "nl" ? "Resultaten" : "Results"}</h2>
            <p>{formatNumber(orders.length, locale)} {locale === "nl" ? "bestellingen getoond" : "orders shown"}{orders.length === 200 ? ` · ${locale === "nl" ? "maximaal 200" : "maximum 200"}` : ""}</p>
          </div>
        </div>
        {orders.length === 0 ? (
          <AdminEmptyState
            icon={ShoppingCart}
            title={locale === "nl" ? "Geen bestellingen gevonden" : "No orders found"}
            description={locale === "nl" ? "Pas je zoekopdracht of statusfilter aan." : "Adjust your search or status filter."}
          />
        ) : (
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-admin-orders-table">
              <thead>
                <tr>
                  <th>{locale === "nl" ? "Referentie" : "Reference"}</th>
                  <th>{locale === "nl" ? "Koper" : "Buyer"}</th>
                  <th>Status</th>
                  <th data-priority="low">Tickets</th>
                  <th>{locale === "nl" ? "Bedrag" : "Amount"}</th>
                  <th data-priority="low">{locale === "nl" ? "Aangemaakt" : "Created"}</th>
                  <th><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const payment = order.payments[0];
                  const canResendConfirmation =
                    canManageOrders &&
                    ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status);
                  return (
                    <tr key={order.id}>
                      <td className="ticket-admin-code">{order.reference}</td>
                      <td data-wrap="true">
                        <strong>{order.buyerName}</strong>
                        <div className="ticket-admin-row-meta">{order.buyerEmail}</div>
                      </td>
                      <td><StatusBadge status={order.status} locale={locale} /></td>
                      <td data-priority="low">{formatNumber(order.items.length, locale)}</td>
                      <td>
                        {canViewFinance ? formatMoney(order.totalCents, order.currency, locale) : "—"}
                        {canViewFinance && order.refundedCents > 0 ? (
                          <div className="ticket-admin-row-meta">-{formatMoney(order.refundedCents, order.currency, locale)}</div>
                        ) : null}
                      </td>
                      <td data-priority="low">{formatDateTime(order.createdAt, locale)}</td>
                      <td className="ticket-admin-disclosure-cell">
                        <details className="ticket-admin-row-details">
                          <summary
                            className="ticket-admin-icon-button"
                            aria-label={`${locale === "nl" ? "Details van" : "Details for"} ${order.reference}`}
                            title={locale === "nl" ? "Details" : "Details"}
                          >
                            <ChevronDown aria-hidden="true" size={17} />
                          </summary>
                          <div className="ticket-admin-row-details-panel">
                            <div className="ticket-admin-detail-grid">
                              <div>
                                <h3>{locale === "nl" ? "Betaling" : "Payment"}</h3>
                                <dl className="ticket-admin-spec">
                                  <div><dt>{locale === "nl" ? "Provider" : "Provider"}</dt><dd>{payment?.provider ?? "—"}</dd></div>
                                  <div><dt>Status</dt><dd>{payment ? <StatusBadge status={payment.status} locale={locale} /> : "—"}</dd></div>
                                  <div><dt>{locale === "nl" ? "Providerstatus" : "Provider status"}</dt><dd>{payment?.providerStatus ?? "—"}</dd></div>
                                  <div><dt>{locale === "nl" ? "Betaald op" : "Paid at"}</dt><dd>{formatDateTime(order.paidAt, locale)}</dd></div>
                                </dl>
                              </div>
                              <div>
                                <h3>{locale === "nl" ? "Bedragen" : "Amounts"}</h3>
                                <dl className="ticket-admin-spec">
                                  <div><dt>{locale === "nl" ? "Totaal" : "Total"}</dt><dd>{canViewFinance ? formatMoney(order.totalCents, order.currency, locale) : "—"}</dd></div>
                                  <div><dt>{locale === "nl" ? "Terugbetaald" : "Refunded"}</dt><dd>{canViewFinance ? formatMoney(order.refundedCents, order.currency, locale) : "—"}</dd></div>
                                  <div><dt>{locale === "nl" ? "Voorwaarden" : "Terms"}</dt><dd>{order.termsVersion ?? "—"}</dd></div>
                                </dl>
                              </div>
                            </div>

                            {canResendConfirmation ? (
                              <div className="ticket-admin-detail-actions">
                                <form action={resendTicketOrderConfirmationAction}>
                                  <input type="hidden" name="locale" value={locale} />
                                  <input type="hidden" name="eventId" value={eventId} />
                                  <input type="hidden" name="orderId" value={order.id} />
                                  <button className="ticket-admin-button" type="submit">
                                    <MailPlus aria-hidden="true" size={15} />
                                    {locale === "nl" ? "Bevestiging opnieuw versturen" : "Resend confirmation"}
                                  </button>
                                </form>
                              </div>
                            ) : null}

                            <div className="ticket-admin-detail-section">
                              <h3>Tickets</h3>
                              <ul className="ticket-admin-list">
                                {order.items.map((item) => (
                                  <li key={item.id}>
                                    <div className="ticket-admin-row-head">
                                      <div>
                                        <p className="ticket-admin-row-title">{item.attendeeName}</p>
                                        <p className="ticket-admin-row-meta">{item.ticketTypeName}{item.attendeeEmail ? ` · ${item.attendeeEmail}` : ""}</p>
                                      </div>
                                      <StatusBadge status={item.ticket?.status ?? "PENDING"} locale={locale} />
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {order.refunds.length > 0 ? (
                              <div className="ticket-admin-detail-section">
                                <h3>{locale === "nl" ? "Terugbetalingen" : "Refunds"}</h3>
                                <ul className="ticket-admin-list">
                                  {order.refunds.map((refund) => (
                                    <li key={refund.id}>
                                      <div className="ticket-admin-row-head">
                                        <div>
                                          <p className="ticket-admin-row-title">{formatMoney(refund.amountCents, refund.currency, locale)} · {refund._count.items} ticket{refund._count.items === 1 ? "" : "s"}</p>
                                          <p className="ticket-admin-row-meta">{formatDateTime(refund.createdAt, locale)}{refund.reason ? ` · ${refund.reason}` : ""}</p>
                                        </div>
                                        <StatusBadge status={refund.status} locale={locale} />
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {canRefund ? (
                              <details className="ticket-admin-details ticket-admin-refund-details">
                                <summary><RotateCcw aria-hidden="true" size={15} />{locale === "nl" ? "Tickets terugbetalen" : "Refund tickets"}</summary>
                                <div className="ticket-admin-details-body">
                                  <RefundOrderForm
                                    eventId={eventId}
                                    orderId={order.id}
                                    items={order.items}
                                    currency={order.currency}
                                    locale={locale}
                                  />
                                </div>
                              </details>
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
