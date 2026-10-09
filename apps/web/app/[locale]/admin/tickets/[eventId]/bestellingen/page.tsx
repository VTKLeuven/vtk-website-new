import { InteractiveRow } from "@/components/ticketing/admin/InteractiveRow";
import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma, TicketOrderStatus } from "@prisma/client";
import {
  AlertTriangle,
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
import {
  markTicketPaymentRefundedAction,
  resendTicketOrderConfirmationAction,
} from "@/app/actions/tickets";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { awaitingManualRefund, notSetAside } from "@/lib/ticketing/paymentFlags";
import { ConfirmIconButton } from "@/components/ui/DeleteIconButton";
import { CheckIcon } from "@/components/ui/icons";
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

/**
 * Geen status van een bestelling maar een filter in dezelfde keuzelijst: de
 * bestellingen met een geslaagde betaling die met de hand terugbetaald moet
 * worden (zie `recordPaymentNeedingRefund`).
 */
const NEEDS_REFUND_FILTER = "NEEDS_REFUND";

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
  const needsRefundOnly = filters.status === NEEDS_REFUND_FILTER;

  const where: Prisma.TicketOrderWhereInput = {
    eventId,
    ...(status ? { status } : {}),
    ...(needsRefundOnly ? { payments: { some: awaitingManualRefund } } : {}),
    ...(query
      ? {
          OR: [
            { reference: { contains: query, mode: "insensitive" } },
            { buyerName: { contains: query, mode: "insensitive" } },
            { buyerEmail: { contains: query, mode: "insensitive" } },
            { items: { some: { attendeeName: { contains: query, mode: "insensitive" } } } },
            { items: { some: { attendeeEmail: { contains: query, mode: "insensitive" } } } },
            // De betaal-ID van Bancontact of Mollie: die staat op het
            // rekeninguittreksel en in de uitbetaling, het ordernummer niet.
            { payments: { some: { providerPaymentId: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [orders, totalOrders, paidOrders, pendingOrders, refundedOrders, totals, flaggedPayments] = await Promise.all([
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
        // De betaling die telt: de jongste poging die niet apart staat. Een
        // betaling die op een terugbetaling wacht, komt apart hieronder.
        payments: { where: notSetAside, orderBy: { createdAt: "desc" }, take: 1 },
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
    // Alle betalingen van dit event die nog terug moeten: zelden meer dan een
    // handvol, en zo telt de melding bovenaan ze ook wanneer hun bestelling
    // buiten de filter van de lijst valt.
    prisma.ticketPayment.findMany({
      where: { ...awaitingManualRefund, order: { eventId } },
      select: {
        id: true,
        orderId: true,
        provider: true,
        providerPaymentId: true,
        amountCents: true,
        currency: true,
        succeededAt: true,
      },
      orderBy: { succeededAt: "asc" },
    }),
  ]);
  const awaitingRefund = flaggedPayments.length;
  const flaggedByOrder = new Map<string, typeof flaggedPayments>();
  for (const flagged of flaggedPayments) {
    flaggedByOrder.set(flagged.orderId, [...(flaggedByOrder.get(flagged.orderId) ?? []), flagged]);
  }
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

      {awaitingRefund > 0 ? (
        <div className="ticket-admin-alert" data-tone="danger" role="status">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>
            {locale === "nl"
              ? `${formatNumber(awaitingRefund, locale)} ${awaitingRefund === 1 ? "betaling kwam" : "betalingen kwamen"} binnen zonder ticket. Betaal ze met de hand terug en vink ze daarna af bij de bestelling.`
              : `${formatNumber(awaitingRefund, locale)} ${awaitingRefund === 1 ? "payment" : "payments"} came in without a ticket. Refund them by hand, then mark them as refunded on the order.`}
            {needsRefundOnly ? null : (
              <a className="ticket-admin-alert-link" href={`?status=${NEEDS_REFUND_FILTER}`}>
                {locale === "nl" ? "Toon die bestellingen" : "Show those orders"}
              </a>
            )}
          </span>
        </div>
      ) : null}

      <section className="ticket-admin-section" aria-labelledby="orders-heading">
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
                placeholder={locale === "nl" ? "Referentie, naam, e-mail of betaal-ID" : "Reference, name, email or payment ID"}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="order-status">Status</label>
            <select
              id="order-status"
              name="status"
              defaultValue={status ?? (needsRefundOnly ? NEEDS_REFUND_FILTER : "")}
            >
              <option value="">{locale === "nl" ? "Alle statussen" : "All statuses"}</option>
              {ORDER_STATUSES.map((option) => (
                <option key={option} value={option}>{statusLabel(option, locale)}</option>
              ))}
              <option value={NEEDS_REFUND_FILTER}>{locale === "nl" ? "Terug te betalen" : "To refund"}</option>
            </select>
          </div>
          <button className="ticket-admin-button" type="submit">
            <Filter aria-hidden="true" size={15} />
            {locale === "nl" ? "Filter" : "Filter"}
          </button>
        </form>
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
                  const toRefund = flaggedByOrder.get(order.id) ?? [];
                  const canResendConfirmation =
                    canManageOrders &&
                    ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status);
                  return (
                    <InteractiveRow key={order.id}>
                      <td className="ticket-admin-code">{order.reference}</td>
                      <td data-wrap="true">
                        <strong>{order.buyerName}</strong>
                        <div className="ticket-admin-row-meta">{order.buyerEmail}</div>
                      </td>
                      <td>
                        <StatusBadge status={order.status} locale={locale} />
                        {toRefund.length > 0 ? (
                          <div className="ticket-admin-row-meta">
                            <span className="ticket-admin-status" data-tone="danger">
                              <span className="ticket-admin-status-dot" aria-hidden="true" />
                              {locale === "nl" ? "Terug te betalen" : "To refund"}
                            </span>
                          </div>
                        ) : null}
                      </td>
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

                            {toRefund.length > 0 ? (
                              <div className="ticket-admin-detail-section">
                                <h3>{locale === "nl" ? "Terug te betalen" : "To refund"}</h3>
                                <p className="ticket-admin-help">
                                  {locale === "nl"
                                    ? "Deze betaling kwam binnen zonder dat er een ticket tegenover stond: de reservatie was verlopen en de plaats weg, het event voorbij, of de bestelling was al betaald. Betaal ze met de hand terug bij de provider of via de bank."
                                    : "This payment came in without a ticket to go with it: the reservation had expired and the seat was gone, the event was over, or the order was already paid. Refund it by hand at the provider or through the bank."}
                                </p>
                                <ul className="ticket-admin-list">
                                  {toRefund.map((flagged) => {
                                    const amount = formatMoney(flagged.amountCents, flagged.currency, locale);
                                    const paymentLabel = flagged.providerPaymentId ?? flagged.id;
                                    return (
                                      <li key={flagged.id}>
                                        <div className="ticket-admin-row-head">
                                          <p className="ticket-admin-row-title ticket-admin-code">{paymentLabel}</p>
                                          {canRefund ? (
                                            <ConfirmIconButton
                                              icon={<CheckIcon />}
                                              label={locale === "nl" ? "Markeer als terugbetaald" : "Mark as refunded"}
                                              srLabel={`${locale === "nl" ? "Markeer als terugbetaald" : "Mark as refunded"}: ${paymentLabel}`}
                                              action={markTicketPaymentRefundedAction}
                                              fields={{ locale, eventId, paymentId: flagged.id }}
                                              title={locale === "nl" ? "Markeren als terugbetaald?" : "Mark as refunded?"}
                                              description={
                                                locale === "nl"
                                                  ? `Dit betaalt niets terug: het vinkt enkel af dat de ${canViewFinance ? amount : "betaling"} van ${order.reference} al met de hand teruggegeven is. De melding bovenaan verdwijnt; de bestelling en haar tickets blijven zoals ze zijn.`
                                                  : `This does not refund anything: it only records that the ${canViewFinance ? amount : "payment"} for ${order.reference} was already returned by hand. The notice at the top goes away; the order and its tickets stay as they are.`
                                              }
                                              confirmLabel={locale === "nl" ? "Markeer als terugbetaald" : "Mark as refunded"}
                                              cancelLabel={locale === "nl" ? "Annuleren" : "Cancel"}
                                              successMessage={locale === "nl" ? "Betaling gemarkeerd als terugbetaald." : "Payment marked as refunded."}
                                              errorMessages={{
                                                PAYMENT_NOT_AWAITING_REFUND:
                                                  locale === "nl"
                                                    ? "Niet gemarkeerd: deze betaling wacht niet meer op een terugbetaling. Misschien vinkte iemand anders ze net af."
                                                    : "Not marked: this payment is no longer awaiting a refund. Someone else may have just marked it.",
                                              }}
                                              errorFallback={locale === "nl" ? "Betaling niet gemarkeerd." : "Payment was not marked."}
                                            />
                                          ) : null}
                                        </div>
                                        <dl className="ticket-admin-spec">
                                          {canViewFinance ? (
                                            <div><dt>{locale === "nl" ? "Bedrag" : "Amount"}</dt><dd>{amount}</dd></div>
                                          ) : null}
                                          <div><dt>Provider</dt><dd>{flagged.provider}</dd></div>
                                          <div><dt>{locale === "nl" ? "Betaald op" : "Paid at"}</dt><dd>{formatDateTime(flagged.succeededAt, locale)}</dd></div>
                                        </dl>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : null}

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
                    </InteractiveRow>
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
