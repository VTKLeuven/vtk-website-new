"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, CircleDashed, RotateCcw, Smartphone, TimerOff } from "lucide-react";

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
 *
 * **Een QR vervalt eerder dan de reservatie.** De betaling bij de provider leeft
 * kort (bij ons contract twee minuten), de tickets blijven een half uur
 * vasthangen. Wie in die tussentijd zijn telefoon zoekt, staat dus voor een QR
 * die niets meer doet en een pagina die rustig blijft wachten. Daarom telt deze
 * pagina af op `expiresAt` van de provider zelf, en vraagt ze bij het verstrijken
 * een nieuwe betaling aan in plaats van de dode QR te laten staan.
 *
 * Dat gebeurt op een klik en niet vanzelf: een nieuwe betaling annuleert de
 * vorige, en wie net aan het bevestigen is in zijn app mag dat niet onder zijn
 * handen weg zien vallen. `startOrderPayment` vraagt het bovendien eerst aan de
 * provider, dus een betaling die intussen toch doorging, levert alsnog tickets.
 */
export function BancontactPayment({
  orderId,
  locale,
  deeplink,
  paymentId,
  expiresAt,
  orderNumber,
  amountLabel,
}: {
  orderId: string;
  locale: "nl" | "en";
  deeplink: string;
  paymentId: string;
  /** Wanneer deze QR vervalt bij de provider, of null als hij dat niet zegt. */
  expiresAt: string | null;
  orderNumber: string;
  amountLabel: string;
}) {
  const base = locale === "nl" ? "" : "/en";
  const orderHref = `${base}/tickets/bestelling/${orderId}`;
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewFailed, setRenewFailed] = useState(false);
  // De vervallen-staat hangt aan één betaling, niet aan de pagina: zo is ze na
  // een nieuwe QR vanzelf weer onwaar, zonder ze in een effect terug te zetten.
  const [expiredPaymentId, setExpiredPaymentId] = useState<string | null>(null);
  const expired = expiredPaymentId === paymentId;

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

  // Eén timer op het moment zelf, geen tikkende klok: een aftelling van twee
  // minuten naast een QR jaagt vooral op, en de koper heeft aan "deze QR is
  // vervallen" genoeg om te weten wat hij moet doen.
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (Number.isNaN(remaining)) return;
    const timer = setTimeout(() => setExpiredPaymentId(paymentId), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [expiresAt, paymentId]);

  async function renew() {
    if (renewing) return;
    setRenewing(true);
    setRenewFailed(false);
    try {
      const response = await fetch(`/api/tickets/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "bancontact", locale }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        // Al betaald, verlopen reservatie of een betaling die elders openstaat:
        // dat hoort op de bestelpagina thuis, die het uitlegt en de tickets
        // toont. Hier staat enkel de QR.
        if (payload.error && payload.error !== "PAYMENT_UNAVAILABLE") {
          router.push(orderHref);
          return;
        }
        setRenewFailed(true);
        setRenewing(false);
        return;
      }
      // De server heeft nu een nieuwe betaling; deze server component leest ze
      // opnieuw op en de QR eronder ververst mee via `paymentId`.
      router.refresh();
      setRenewing(false);
    } catch {
      setRenewFailed(true);
      setRenewing(false);
    }
  }

  return (
    <div className="ticket-bancontact">
      <section className="ticket-bancontact-head">
        <span>
          {locale === "nl" ? "Bestelling" : "Order"} {orderNumber}
        </span>
        <h1>{locale === "nl" ? "Betaal met Bancontact" : "Pay with Bancontact"}</h1>
        <strong>{amountLabel}</strong>
      </section>

      {expired && !done ? (
        <section className="ticket-bancontact-expired">
          <TimerOff size={22} aria-hidden="true" />
          <div>
            <strong>
              {locale === "nl" ? "Deze QR-code is vervallen" : "This QR code has expired"}
            </strong>
            <p>
              {locale === "nl"
                ? "Je tickets staan nog voor je klaar. Vraag een nieuwe code aan om verder te betalen."
                : "Your tickets are still held for you. Request a new code to continue paying."}
            </p>
            {renewFailed ? (
              <p className="ticket-bancontact-expired-error" role="alert">
                {locale === "nl"
                  ? "Een nieuwe code aanvragen lukte niet. Probeer het nog eens, of kies een andere betaalmethode."
                  : "Requesting a new code failed. Try again, or choose another payment method."}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="ticket-primary-button"
            onClick={() => void renew()}
            disabled={renewing}
          >
            <RotateCcw className={renewing ? "is-spinning" : undefined} size={18} aria-hidden="true" />
            {locale === "nl" ? "Nieuwe QR-code" : "New QR code"}
          </button>
        </section>
      ) : (
        <section className="ticket-bancontact-panel">
          <div className="ticket-bancontact-qr">
            <Image
              // `paymentId` staat erbij zodat een nieuwe betaling ook een nieuwe
              // afbeelding is: zonder dat blijft de browser dezelfde URL tonen.
              src={`/api/tickets/orders/${orderId}/bancontact/qr?betaling=${paymentId}`}
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
      )}

      <div className="ticket-bancontact-waiting" role="status" aria-live="polite">
        {done ? (
          <>
            <CheckCircle2 size={18} aria-hidden="true" />
            {locale === "nl" ? "Betaling ontvangen" : "Payment received"}
          </>
        ) : (
          expired ? null : (
            <>
              <CircleDashed className="is-spinning" size={18} aria-hidden="true" />
              {locale === "nl"
                ? "We wachten op je betaling. Deze pagina springt vanzelf verder."
                : "Waiting for your payment. This page continues on its own."}
            </>
          )
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
