"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trackTicketPurchased } from "@/lib/analytics-client";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Clock3,
  MailCheck,
  RefreshCw,
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

function isOrder(value: StatusPayload): value is PublicOrder {
  return "id" in value && typeof value.id === "string";
}

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

  return (
    <div className="ticket-order-status">
      <section
        className={`ticket-status-hero${paid ? " is-paid" : failed ? " is-failed" : " is-pending"}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="ticket-status-icon">
          {paid ? (
            <CheckCircle2 aria-hidden="true" />
          ) : failed ? (
            <XCircle aria-hidden="true" />
          ) : canChoosePayment ? (
            // Wie nog moet kiezen, wacht nergens op: een draaiend icoon zou hier
            // beweging tonen zonder dat er iets gebeurt.
            <Clock3 aria-hidden="true" />
          ) : (
            <CircleDashed className="is-spinning" aria-hidden="true" />
          )}
        </div>
        <div>
          <span>{locale === "nl" ? "Bestelling" : "Order"} {order.orderNumber}</span>
          <h1>
            {paid
              ? locale === "nl" ? "Je tickets zijn klaar" : "Your tickets are ready"
              : failed
                ? locale === "nl" ? "De bestelling is niet voltooid" : "The order was not completed"
                : canChoosePayment
                  ? locale === "nl" ? "Je tickets staan klaar" : "Your tickets are reserved"
                  : locale === "nl" ? "We verwerken je betaling" : "We are processing your payment"}
          </h1>
          <p>
            {paid
              ? locale === "nl" ? `Een bevestiging is verstuurd naar ${order.buyerEmail}.` : `A confirmation was sent to ${order.buyerEmail}.`
              : failed
                ? locale === "nl" ? "Er werden geen geldige tickets uitgegeven voor deze bestelling." : "No valid tickets were issued for this order."
                : canChoosePayment
                  ? locale === "nl" ? "Ze blijven gereserveerd tot je betaling rond is." : "They stay reserved until your payment goes through."
                  : locale === "nl" ? "Dit wordt automatisch bijgewerkt. Je mag deze pagina openlaten." : "This page updates automatically. You can leave it open."}
          </p>
        </div>
      </section>

      {pollError && !failed ? (
        <div className="ticket-status-warning" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          {locale === "nl" ? "De status kon even niet worden opgehaald. We proberen opnieuw." : "We could not refresh the status. Retrying automatically."}
        </div>
      ) : null}

      <section className="ticket-order-details" aria-labelledby="order-details-title">
        <div className="ticket-order-detail-head">
          <div>
            <span>{locale === "nl" ? "Event" : "Event"}</span>
            <h2 id="order-details-title">{order.event.title}</h2>
          </div>
          <strong>{formatTicketPrice(order.totalCents, order.currency, locale)}</strong>
        </div>
        <dl>
          <div><dt>{locale === "nl" ? "Datum" : "Date"}</dt><dd>{formatTicketDate(order.event.startsAt, locale)}</dd></div>
          <div><dt>{locale === "nl" ? "Locatie" : "Location"}</dt><dd>{order.event.location ?? "-"}</dd></div>
          <div><dt>{locale === "nl" ? "Koper" : "Buyer"}</dt><dd>{order.buyerName}</dd></div>
          <div><dt>Status</dt><dd>{formatTicketOrderStatus(order.status, locale)}</dd></div>
        </dl>
      </section>

      {paid && order.tickets.length > 0 ? (
        <section className="ticket-issued-section" aria-labelledby="issued-tickets-title">
          <div className="ticket-section-title-row">
            <div>
              <span>{order.tickets.length} {locale === "nl" ? "tickets" : "tickets"}</span>
              <h2 id="issued-tickets-title">{locale === "nl" ? "Jouw toegangsbewijzen" : "Your admission tickets"}</h2>
            </div>
            <TicketCheck size={28} aria-hidden="true" />
          </div>
          <div className="ticket-pass-list">
            {order.tickets.map((ticket) => <TicketPass key={ticket.id} ticket={ticket} locale={locale} />)}
          </div>
          <div className="ticket-mail-note"><MailCheck size={18} aria-hidden="true" /> {locale === "nl" ? "Dezelfde tickets vind je ook in je mailbox." : "The same tickets are also in your inbox."}</div>
        </section>
      ) : null}

      {canChoosePayment ? (
        <PaymentMethodChooser orderId={order.id} locale={locale} choice={paymentChoice} />
      ) : null}

      {!paid && !failed && !canChoosePayment ? (
        <div className="ticket-processing-row"><Clock3 size={18} aria-hidden="true" /> {locale === "nl" ? "Wachten op bevestiging van de betaalprovider" : "Waiting for payment confirmation"}</div>
      ) : null}

      <div className="ticket-order-actions">
        <Link className="ticket-secondary-button" href={`${base}/tickets`}><ArrowLeft size={17} aria-hidden="true" /> {locale === "nl" ? "Naar alle events" : "All events"}</Link>
        {pollError ? <button type="button" className="ticket-secondary-button" onClick={() => window.location.reload()}><RefreshCw size={17} aria-hidden="true" /> {locale === "nl" ? "Vernieuwen" : "Refresh"}</button> : null}
      </div>
    </div>
  );
}
