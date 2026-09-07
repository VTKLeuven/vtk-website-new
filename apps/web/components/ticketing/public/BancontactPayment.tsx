"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, CircleDashed, Smartphone } from "lucide-react";

type OrderStatusPayload = { status?: string };

const TERMINAL = new Set([
  "PAID",
  "PARTIALLY_REFUNDED",
  "PAYMENT_FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);

/**
 * De betaalpagina van Bancontact, die wij zelf hosten.
 *
 * De provider levert geen checkoutpagina maar een deeplink: op een telefoon is
 * dat een sprong naar de Bancontact-app, op een laptop een QR die je met die app
 * scant. Beide staan er altijd, want een koper op een laptop met de app op zijn
 * telefoon is hier het normale geval, en niet de uitzondering.
 *
 * De status komt van dezelfde pollende route als de bestelpagina; er is geen
 * terugkeer uit de app waar we op kunnen rekenen.
 */
export function BancontactPayment({
  orderId,
  locale,
  deeplink,
  orderNumber,
  amountLabel,
}: {
  orderId: string;
  locale: "nl" | "en";
  deeplink: string;
  orderNumber: string;
  amountLabel: string;
}) {
  const base = locale === "nl" ? "" : "/en";
  const orderHref = `${base}/tickets/bestelling/${orderId}`;
  const router = useRouter();
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function poll() {
      try {
        const response = await fetch(`/api/tickets/orders/${orderId}/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("status request failed");
        const payload = (await response.json()) as OrderStatusPayload;
        if (cancelled) return;
        if (payload.status && TERMINAL.has(payload.status)) {
          // De bestelpagina toont de tickets of de reden waarom er geen zijn;
          // die hoeft deze pagina niet te herhalen.
          setDone(true);
          router.push(orderHref);
          return;
        }
        timer = setTimeout(poll, 2500);
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          timer = setTimeout(poll, 5000);
        }
      }
    }

    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [orderId, orderHref, router]);

  return (
    <div className="ticket-bancontact">
      <section className="ticket-bancontact-head">
        <span>
          {locale === "nl" ? "Bestelling" : "Order"} {orderNumber}
        </span>
        <h1>{locale === "nl" ? "Betaal met Bancontact" : "Pay with Bancontact"}</h1>
        <strong>{amountLabel}</strong>
      </section>

      <section className="ticket-bancontact-panel">
        <div className="ticket-bancontact-qr">
          <Image
            src={`/api/tickets/orders/${orderId}/bancontact/qr`}
            alt={
              locale === "nl"
                ? "QR-code om te betalen met de Bancontact-app"
                : "QR code to pay with the Bancontact app"
            }
            width={260}
            height={260}
            unoptimized
            priority
          />
          <p>
            {locale === "nl"
              ? "Scan met de Bancontact-app op je telefoon."
              : "Scan this with the Bancontact app on your phone."}
          </p>
        </div>

        <div className="ticket-bancontact-direct">
          <a className="ticket-primary-button" href={deeplink}>
            <Smartphone size={18} aria-hidden="true" />
            {locale === "nl" ? "Open de Bancontact-app" : "Open the Bancontact app"}
          </a>
          <p>
            {locale === "nl"
              ? "Betaal je op je telefoon? Gebruik deze knop in plaats van de QR."
              : "Paying on your phone? Use this button instead of the QR code."}
          </p>
        </div>
      </section>

      <div className="ticket-bancontact-waiting" role="status" aria-live="polite">
        {done ? (
          <>
            <CheckCircle2 size={18} aria-hidden="true" />
            {locale === "nl" ? "Betaling ontvangen" : "Payment received"}
          </>
        ) : (
          <>
            <CircleDashed className="is-spinning" size={18} aria-hidden="true" />
            {locale === "nl"
              ? "We wachten op je betaling. Deze pagina springt vanzelf verder."
              : "Waiting for your payment. This page continues on its own."}
          </>
        )}
      </div>

      <div className="ticket-order-actions">
        <Link className="ticket-secondary-button" href={orderHref}>
          <ArrowLeft size={17} aria-hidden="true" />
          {locale === "nl" ? "Andere betaalmethode" : "Other payment method"}
        </Link>
      </div>
    </div>
  );
}
