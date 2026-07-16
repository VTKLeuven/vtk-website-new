"use client";

import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ExchangeError = "invalid" | "temporary" | null;

export function AccessExchange({ locale }: { locale: "nl" | "en" }) {
  const router = useRouter();
  const [error, setError] = useState<ExchangeError>(null);
  const [attempt, setAttempt] = useState(0);
  const credentialsRef = useRef<{ orderId: string; access: string } | null>(null);

  useEffect(() => {
    const credentials = credentialsRef.current ?? {
      orderId: new URLSearchParams(window.location.search).get("orderId") ?? "",
      access: new URLSearchParams(window.location.hash.slice(1)).get("access") ?? "",
    };
    const { orderId, access } = credentials;

    if (!orderId || !access) {
      const errorTimer = window.setTimeout(() => setError("invalid"), 0);
      return () => window.clearTimeout(errorTimer);
    }
    credentialsRef.current = credentials;

    const controller = new AbortController();
    window.history.replaceState(null, "", window.location.pathname);
    void fetch(`/api/tickets/orders/${encodeURIComponent(orderId)}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access }),
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) {
        setError(response.status >= 500 ? "temporary" : "invalid");
        return;
      }
      const prefix = locale === "en" ? "/en" : "";
      router.replace(`${prefix}/tickets/bestelling/${orderId}`);
    }).catch((requestError) => {
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
        setError("temporary");
      }
    });
    return () => {
      controller.abort();
    };
  }, [attempt, locale, router]);

  return (
    <main className="ticket-access-page">
      <div className="ticket-access-state" role="status">
        {error ? <AlertCircle aria-hidden="true" /> : <LoaderCircle className="is-spinning" aria-hidden="true" />}
        <h1>
          {error
            ? error === "temporary"
              ? locale === "nl" ? "Je tickets konden niet worden geopend" : "Your tickets could not be opened"
              : locale === "nl" ? "Deze ticketlink is niet geldig" : "This ticket link is not valid"
            : locale === "nl" ? "Je tickets worden geopend" : "Opening your tickets"}
        </h1>
        <p>
          {error
            ? error === "temporary"
              ? locale === "nl" ? "De verbinding is tijdelijk mislukt. Probeer opnieuw." : "The connection failed temporarily. Please try again."
              : locale === "nl" ? "Vraag de organisator om de bevestigingsmail opnieuw te versturen." : "Ask the organizer to resend the confirmation email."
            : locale === "nl" ? "Even geduld." : "One moment."}
        </p>
        {error === "temporary" ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((current) => current + 1);
            }}
          >
            <RefreshCw aria-hidden="true" size={17} />
            {locale === "nl" ? "Opnieuw proberen" : "Try again"}
          </button>
        ) : null}
      </div>
    </main>
  );
}
