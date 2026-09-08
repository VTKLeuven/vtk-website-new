"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, CreditCard, Loader2, Smartphone } from "lucide-react";

export type PaymentMethodOption = {
  provider: "mollie" | "bancontact" | "mock";
  /** Officieel logo, of null; dan toont de knop een pictogram. */
  logo: string | null;
};

export type PaymentMethodChoice = {
  variant: "single" | "collapsed" | "equal";
  options: PaymentMethodOption[];
};

const LABELS: Record<
  PaymentMethodOption["provider"],
  { nl: { title: string; hint: string }; en: { title: string; hint: string } }
> = {
  bancontact: {
    nl: { title: "Bancontact", hint: "Betaal met de Bancontact-app" },
    en: { title: "Bancontact", hint: "Pay with the Bancontact app" },
  },
  mollie: {
    nl: { title: "Mollie", hint: "Kaart, iDEAL en andere betaalmethodes" },
    en: { title: "Mollie", hint: "Card, iDEAL and other payment methods" },
  },
  mock: {
    nl: { title: "Testbetaling", hint: "Enkel lokaal" },
    en: { title: "Test payment", hint: "Local only" },
  },
};

const ERRORS: Record<string, { nl: string; en: string }> = {
  ALREADY_PAID: {
    nl: "Deze bestelling is al betaald.",
    en: "This order has already been paid.",
  },
  RESERVATION_EXPIRED: {
    nl: "Je reservatie is verlopen. Bestel opnieuw om je tickets vast te zetten.",
    en: "Your reservation expired. Order again to hold your tickets.",
  },
  PAYMENT_PENDING_ELSEWHERE: {
    nl: "Er staat nog een betaling open. Wacht even en probeer opnieuw.",
    en: "A payment is still open. Wait a moment and try again.",
  },
  PAYMENT_UNAVAILABLE: {
    nl: "Deze betaalmethode werkt nu niet. Probeer de andere.",
    en: "This payment method is not working right now. Try the other one.",
  },
};

function errorMessage(code: string | null, locale: "nl" | "en"): string | null {
  if (!code) return null;
  const entry = ERRORS[code];
  if (entry) return entry[locale];
  return locale === "nl"
    ? "De betaling kon niet gestart worden. Probeer opnieuw."
    : "The payment could not be started. Please try again.";
}

/**
 * De betaalwijzekeuze op de bestelpagina.
 *
 * De volgorde en het gewicht komen van de server (`lib/ticketing/paymentMethods.ts`),
 * niet van hier: welke methode voorop staat is een keuze per taal en hoort bij de
 * configuratie, niet bij de opmaak.
 */
export function PaymentMethodChooser({
  orderId,
  locale,
  choice,
  checkout,
}: {
  orderId?: string;
  locale: "nl" | "en";
  choice: PaymentMethodChoice;
  checkout?: { busy: boolean; busyProvider?: string | null; disabled: boolean };
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: PaymentMethodOption["provider"]) {
    if (!orderId || busy) return;
    setBusy(provider);
    setError(null);
    try {
      const response = await fetch(`/api/tickets/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, locale }),
      });
      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) {
        // Een al betaalde of verlopen bestelling hoort thuis op de bestelpagina
        // zelf, niet in een foutmelding onder een knop die niets meer kan doen.
        if (payload.error === "ALREADY_PAID") {
          window.location.reload();
          return;
        }
        setError(payload.error ?? "PAYMENT_UNAVAILABLE");
        setBusy(null);
        return;
      }
      window.location.assign(payload.checkoutUrl);
    } catch {
      setError("PAYMENT_UNAVAILABLE");
      setBusy(null);
    }
  }

  const message = errorMessage(error, locale);
  // Bij `collapsed` staat enkel de eerste betaalwijze er; de rest komt pas na een
  // klik. Dat is de nudge naar de goedkoopste betaalwijze: geen andere kleur,
  // maar één klik verschil.
  const [expanded, setExpanded] = useState(false);
  const collapsed = choice.variant === "collapsed" && !expanded;
  const visible = collapsed ? choice.options.slice(0, 1) : choice.options;
  const hiddenCount = choice.options.length - visible.length;

  return (
    <section className="ticket-pay-choice" aria-labelledby="ticket-pay-choice-title">
      <h2 id="ticket-pay-choice-title">
        {locale === "nl" ? "Hoe wil je betalen?" : "How would you like to pay?"}
      </h2>

      {message ? (
        <p className="ticket-pay-error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" /> {message}
        </p>
      ) : null}

      <div className="ticket-pay-options" id="ticket-pay-options">
        {visible.map((option) => {
          const label = LABELS[option.provider][locale];
          return (
            <button
              key={option.provider}
              type={checkout ? "submit" : "button"}
              name={checkout ? "paymentProvider" : undefined}
              value={option.provider}
              className="ticket-pay-option"
              onClick={checkout ? undefined : () => void start(option.provider)}
              disabled={checkout ? checkout.disabled || checkout.busy : busy !== null}
            >
              <PaymentMethodMark
                option={option}
                busy={
                  checkout
                    ? checkout.busy && (checkout.busyProvider ? checkout.busyProvider === option.provider : true)
                    : busy === option.provider
                }
                title={label.title}
              />
              <span className="ticket-pay-option-text">
                <strong>{label.title}</strong>
                <small>{label.hint}</small>
              </span>
            </button>
          );
        })}
      </div>

      {hiddenCount > 0 ? (
        <button
          type="button"
          className="ticket-pay-more"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls="ticket-pay-options"
        >
          <ChevronDown size={16} aria-hidden="true" />
          {locale === "nl" ? "Meer betaalmethodes" : "More payment methods"}
        </button>
      ) : null}
    </section>
  );
}

/**
 * Het merkteken van een betaalwijze: het officiële logo wanneer dat bestand er
 * staat, anders een pictogram.
 *
 * Of het logo bestaat, wordt op de server bepaald (`lib/ticketing/paymentMethods.ts`).
 * Dat is bewust geen `onError` hier: dan zou de knop eerst een gebroken
 * afbeelding tonen. Zie `public/betaalmethodes/LEESMIJ.md` voor waar de
 * merkbestanden vandaan komen; natekenen mag niet, het zijn handelsmerken.
 */
function PaymentMethodMark({
  option,
  busy,
  title,
}: {
  option: PaymentMethodOption;
  busy: boolean;
  title: string;
}) {
  if (busy) return <Loader2 className="is-spinning" size={20} aria-hidden="true" />;
  if (option.logo) {
    // Bewust een gewone <img>: een klein statisch merkbestand haalt niets uit de
    // optimizer van next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="ticket-pay-logo" src={option.logo} alt={title} />;
  }
  const Icon = option.provider === "bancontact" ? Smartphone : CreditCard;
  return <Icon size={20} aria-hidden="true" />;
}
