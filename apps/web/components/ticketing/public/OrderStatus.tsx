"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { trackTicketPurchased } from "@/lib/analytics-client";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  MailCheck,
  MapPin,
  RefreshCw,
  RotateCcw,
  TicketCheck,
  XCircle,
} from "lucide-react";
import { TicketPass } from "./TicketPass";
import { PaymentMethodChooser, type PaymentMethodChoice } from "./PaymentMethodChooser";
import {
  formatTicketDate,
  formatTicketOrderStatus,
  formatTicketPrice,
  type PublicOrder,
} from "./types";

type StatusPayload = PublicOrder | { order?: PublicOrder; error?: string; message?: string };
const TERMINAL = new Set([
  "PAID",
  "PARTIALLY_REFUNDED",
  "PAYMENT_FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);

const TEXT = {
  nl: {
    tickets: "Tickets",
    order: "Bestelling",
    orderPanel: "Je bestelling",
    total: "Totaal",
    buyer: "Koper",
    confirmationTo: "Bevestiging naar",
    status: "Status",
    paidTitle: "Je tickets zijn klaar",
    paidLead: "Een bevestiging is verstuurd naar",
    reservedTitle: "Je tickets staan klaar",
    reservedLead: "Ze blijven gereserveerd tot je betaling rond is.",
    processingTitle: "We verwerken je betaling",
    processingLead: "Dit wordt automatisch bijgewerkt. Je mag deze pagina open laten staan.",
    failedTitle: "De bestelling is niet voltooid",
    failedLead: "Er werden geen geldige tickets uitgegeven voor deze bestelling.",
    passes: "Jouw toegangsbewijzen",
    ticket: "ticket",
    ticketsPlural: "tickets",
    inMailbox: "Dezelfde tickets vind je ook in je mailbox.",
    waitingTitle: "Je toegangsbewijzen verschijnen hier",
    waitingLead:
      "Zodra je betaling rond is, staan de QR-codes op deze pagina en in je mailbox.",
    noneTitle: "Er zijn geen tickets uitgegeven",
    noneLead:
      "De betaling is afgebroken of verlopen, en de plaatsen zijn weer vrijgegeven.",
    orderAgain: "Opnieuw bestellen",
    waitingProvider: "Wachten op bevestiging van de betaalprovider",
    pollFailed: "De status kon even niet worden opgehaald. We proberen opnieuw.",
    refresh: "Vernieuwen",
    myTickets: "Mijn tickets",
    allEvents: "Naar alle events",
  },
  en: {
    tickets: "Tickets",
    order: "Order",
    orderPanel: "Your order",
    total: "Total",
    buyer: "Buyer",
    confirmationTo: "Confirmation to",
    status: "Status",
    paidTitle: "Your tickets are ready",
    paidLead: "A confirmation was sent to",
    reservedTitle: "Your tickets are reserved",
    reservedLead: "They stay reserved until your payment goes through.",
    processingTitle: "We are processing your payment",
    processingLead: "This page updates automatically. You can leave it open.",
    failedTitle: "The order was not completed",
    failedLead: "No valid tickets were issued for this order.",
    passes: "Your admission tickets",
    ticket: "ticket",
    ticketsPlural: "tickets",
    inMailbox: "The same tickets are also in your inbox.",
    waitingTitle: "Your admission tickets appear here",
    waitingLead: "As soon as your payment goes through, the QR codes show up here and in your inbox.",
    noneTitle: "No tickets were issued",
    noneLead: "The payment was cancelled or expired, and the seats were released.",
    orderAgain: "Order again",
    waitingProvider: "Waiting for payment confirmation",
    pollFailed: "We could not refresh the status. Retrying automatically.",
    refresh: "Refresh",
    myTickets: "My tickets",
    allEvents: "All events",
  },
} as const;

function isOrder(value: StatusPayload): value is PublicOrder {
  return "id" in value && typeof value.id === "string";
}

/**
 * De bestelpagina: de donkere paginakop met de status, links de
 * toegangsbewijzen en rechts het bestelpaneel.
 *
 * De kop, de kolommen en dat paneel zijn dezelfde als op de ticketpagina van
 * het event (`vtk-event.css`, `vtk-ticket-shop.css`): het paneel dat daar je
 * winkelmandje droeg, draagt hier je bestelling. Zie docs/design-decisions.md.
 */
export function OrderStatus({
  initialOrder,
  locale,
  paymentChoice,
}: {
  initialOrder: PublicOrder;
  locale: "nl" | "en";
  /** Ontbreekt of `single`: er valt niets te kiezen en er komt geen keuzeblok. */
  paymentChoice?: PaymentMethodChoice;
}) {
  const base = locale === "nl" ? "" : "/en";
  const t = TEXT[locale];
  const [order, setOrder] = useState(initialOrder);
  const [pollError, setPollError] = useState(false);

  useEffect(() => {
    if (TERMINAL.has(order.status)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function poll() {
      try {
        const response = await fetch(`/api/tickets/orders/${initialOrder.id}/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as StatusPayload;
        if (!response.ok) throw new Error("status request failed");
        const nextOrder = isOrder(payload) ? payload : payload.order;
        if (!nextOrder) throw new Error("missing order");
        if (!cancelled) {
          setOrder(nextOrder);
          setPollError(false);
          if (!TERMINAL.has(nextOrder.status)) timer = setTimeout(poll, 2500);
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          setPollError(true);
          timer = setTimeout(poll, 5000);
        }
      }
    }

    timer = setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [initialOrder.id, order.status]);

  const paid = order.status === "PAID" || order.status === "PARTIALLY_REFUNDED";
  const failed = ["PAYMENT_FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(order.status);
  // Zolang de bestelling op betaling wacht, mag de koper (opnieuw) kiezen: een
  // afgebroken betaling laat de bestelling staan, en dan is dit de weg terug.
  const canChoosePayment =
    order.status === "PENDING_PAYMENT" &&
    paymentChoice != null &&
    paymentChoice.variant !== "single" &&
    paymentChoice.options.length > 0;
  const tone = paid ? "ok" : failed ? "bad" : "wait";
  const trackedRef = useRef(false);

  useEffect(() => {
    if (paid && !trackedRef.current) {
      trackedRef.current = true;
      trackTicketPurchased({
        eventSlug: order.event.slug ?? "",
        ticketCount: order.tickets.length,
      });
    }
  }, [paid, order.event.slug, order.tickets.length]);

  const title = paid
    ? t.paidTitle
    : failed
      ? t.failedTitle
      : canChoosePayment
        ? t.reservedTitle
        : t.processingTitle;
  const lead = paid
    ? `${t.paidLead} ${order.buyerEmail}.`
    : failed
      ? t.failedLead
      : canChoosePayment
        ? t.reservedLead
        : t.processingLead;
  const orderAgainHref = order.event.slug ? `${base}/tickets/${order.event.slug}` : `${base}/tickets`;

  return (
    <>
      {/* Dezelfde kop als de ticketpagina van het event, met de status van de
          bestelling in plaats van organisator en locatie. */}
      <header
        className="vtk-page-head vtk-event-head torder-head"
        aria-live="polite"
        aria-atomic="true"
      >
        <div>
          <div className="vtk-page-kicker">
            <Link href={`${base}/tickets`} className="vtk-link">
              {t.tickets}
            </Link>{" "}
            · {order.event.title}
          </div>
          <h1 className="vtk-page-title">{title}</h1>
          <p className="vtk-page-subtitle">{lead}</p>
        </div>
        <div className="vtk-event-meta">
          <div className="torder-total">
            <span>
              {t.order} {order.orderNumber}
            </span>
            <b>{formatTicketPrice(order.totalCents, order.currency, locale)}</b>
            <em data-tone={tone}>
              {paid ? (
                <CheckCircle2 size={15} aria-hidden="true" />
              ) : failed ? (
                <XCircle size={15} aria-hidden="true" />
              ) : (
                <Clock3 size={15} aria-hidden="true" />
              )}
              {formatTicketOrderStatus(order.status, locale)}
            </em>
          </div>
        </div>
      </header>

      <main className="tshop-shell">
        {/* Op een smal scherm staan de tickets eerst; wie nog moet betalen,
            krijgt het paneel eerst, want dat is dan de handeling. */}
        <div className="tshop torder" data-panel-first={!paid || undefined}>
          <div className="tshop-main">
            {pollError && !failed ? (
              <p className="torder-warning" role="status">
                <AlertTriangle size={18} aria-hidden="true" />
                {t.pollFailed}
              </p>
            ) : null}

            {paid && order.event.confirmationMessage ? (
              <p className="torder-message">{order.event.confirmationMessage}</p>
            ) : null}

            {paid && order.tickets.length > 0 ? (
              <section aria-labelledby="issued-tickets-title">
                <div className="torder-section-head">
                  <span className="torder-eyebrow">
                    {order.tickets.length}{" "}
                    {order.tickets.length === 1 ? t.ticket : t.ticketsPlural}
                  </span>
                  <h2 id="issued-tickets-title" className="tshop-heading">
                    {t.passes}
                  </h2>
                </div>
                <div className="ticket-pass-list">
                  {order.tickets.map((ticket) => (
                    <TicketPass
                      key={ticket.id}
                      ticket={ticket}
                      locale={locale}
                      eventTitle={order.event.title}
                      eventDate={order.event.startsAt}
                      eventLocation={order.event.location}
                    />
                  ))}
                </div>
                <p className="torder-mail">
                  <MailCheck size={18} aria-hidden="true" />
                  {t.inMailbox}
                </p>
              </section>
            ) : (
              <section className="torder-wait" data-tone={tone}>
                <span className="torder-wait-icon">
                  {failed ? (
                    <XCircle size={24} aria-hidden="true" />
                  ) : (
                    <CircleDashed className="is-spinning" size={24} aria-hidden="true" />
                  )}
                </span>
                <h2>{failed ? t.noneTitle : t.waitingTitle}</h2>
                <p>{failed ? t.noneLead : t.waitingLead}</p>
                {failed ? (
                  <Link className="ticket-primary-button" href={orderAgainHref}>
                    <RotateCcw size={17} aria-hidden="true" />
                    {t.orderAgain}
                  </Link>
                ) : null}
              </section>
            )}
          </div>

          <aside className="tshop-panel torder-panel" aria-labelledby="torder-panel-title">
            <div className="tshop-panel-head">
              <h2 id="torder-panel-title">{t.orderPanel}</h2>
              <small>{order.orderNumber}</small>
            </div>

            <div className="torder-event">
              <span className="torder-poster">
                {order.event.poster ? (
                  <Image
                    src={order.event.poster.src}
                    alt=""
                    fill
                    sizes="88px"
                    style={{ objectFit: "cover", objectPosition: order.event.poster.position }}
                  />
                ) : null}
              </span>
              <div>
                <strong>{order.event.title}</strong>
                <span>
                  <CalendarDays size={14} aria-hidden="true" />
                  {formatTicketDate(order.event.startsAt, locale)}
                </span>
                {order.event.location ? (
                  <span>
                    <MapPin size={14} aria-hidden="true" />
                    {order.event.location}
                  </span>
                ) : null}
              </div>
            </div>

            {order.lines.length > 0 ? (
              <ul className="torder-lines">
                {order.lines.map((line) => (
                  <li key={line.key}>
                    <i>{line.quantity}&times;</i>
                    <span>
                      {line.name}
                      {/* De stukprijs enkel bij meer dan één: anders staat er
                          twee keer hetzelfde bedrag onder elkaar. */}
                      {line.quantity > 1 ? (
                        <small>
                          {formatTicketPrice(line.unitPriceCents, order.currency, locale)}{" "}
                          {locale === "nl" ? "per stuk" : "each"}
                        </small>
                      ) : null}
                    </span>
                    <b>{formatTicketPrice(line.totalCents, order.currency, locale)}</b>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="tshop-total">
              <span>{t.total}</span>
              <strong>{formatTicketPrice(order.totalCents, order.currency, locale)}</strong>
            </div>

            <dl className="torder-facts">
              <div>
                <dt>{t.buyer}</dt>
                <dd>{order.buyerName}</dd>
              </div>
              <div>
                <dt>{t.confirmationTo}</dt>
                <dd>{order.buyerEmail}</dd>
              </div>
              <div>
                <dt>{t.status}</dt>
                <dd>
                  <span className="torder-chip" data-tone={tone}>
                    {formatTicketOrderStatus(order.status, locale)}
                  </span>
                </dd>
              </div>
            </dl>

            {canChoosePayment ? (
              <PaymentMethodChooser orderId={order.id} locale={locale} choice={paymentChoice} />
            ) : null}

            {!paid && !failed && !canChoosePayment ? (
              <p className="torder-processing">
                <Clock3 size={17} aria-hidden="true" />
                {t.waitingProvider}
              </p>
            ) : null}

            <div className="torder-actions">
              <Link className="ticket-secondary-button" href={`${base}/account#mijn-vtk-tickets`}>
                <TicketCheck size={17} aria-hidden="true" />
                {t.myTickets}
              </Link>
              <Link className="ticket-secondary-button" href={`${base}/tickets`}>
                <ArrowLeft size={17} aria-hidden="true" />
                {t.allEvents}
              </Link>
              {pollError ? (
                <button
                  type="button"
                  className="ticket-secondary-button"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw size={17} aria-hidden="true" />
                  {t.refresh}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
