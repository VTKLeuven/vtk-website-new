"use client";

import { useState, useTransition } from "react";
import { fetchTicketRefundAccountAction } from "@/app/actions/tickets";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { formatIban, type AdminLocale } from "./format";

/**
 * De rekening waarop een koper met Bancontact betaalde, om met de hand op
 * terug te storten. Staat ze nog niet op de betaling, dan haalt een knop ze bij
 * Bancontact op (`fetchBancontactRefundAccount`).
 */
export function RefundAccount({
  eventId,
  paymentId,
  iban,
  accountName,
  locale,
}: {
  eventId: string;
  paymentId: string;
  iban: string | null;
  accountName: string | null;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  if (iban) {
    const formatted = formatIban(iban);
    return (
      <dl className="ticket-admin-spec">
        <div>
          <dt>{nl ? "Rekeningnummer" : "Account number"}</dt>
          <dd>
            <span className="ticket-admin-code">{formatted}</span>{" "}
            <IconButton
              label={copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Kopieer rekeningnummer" : "Copy account number"}
              srLabel={`${nl ? "Kopieer rekeningnummer" : "Copy account number"}: ${formatted}`}
              onClick={() => {
                navigator.clipboard?.writeText(iban).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  },
                  () =>
                    showToast({
                      message: nl ? "Kopiëren lukte niet; selecteer het nummer met de hand." : "Copying failed; select the number by hand.",
                      variant: "error",
                      duration: 0,
                    })
                );
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </dd>
        </div>
        <div>
          <dt>{nl ? "Rekeninghouder" : "Account holder"}</dt>
          <dd>{accountName ?? (nl ? "Niet gemeld door Bancontact" : "Not reported by Bancontact")}</dd>
        </div>
      </dl>
    );
  }

  const errorMessages: Record<string, string> = nl
    ? {
        REFUND_IBAN_ACCESS_DENIED:
          "Bancontact weigert het rekeningnummer: de API-sleutel mist de bevoegdheid MERCHANT_REFUND. Vraag IT om ze toe te voegen in het Bancontact Pro-portaal.",
        REFUND_IBAN_UNAVAILABLE:
          "Bancontact geeft voor deze betaling geen rekeningnummer: ze is niet (meer) geslaagd bij de provider.",
      }
    : {
        REFUND_IBAN_ACCESS_DENIED:
          "Bancontact refuses the account number: the API key lacks the MERCHANT_REFUND authority. Ask IT to add it in the Bancontact Pro portal.",
        REFUND_IBAN_UNAVAILABLE:
          "Bancontact returns no account number for this payment: it has not (or no longer) succeeded at the provider.",
      };

  return (
    <div className="ticket-admin-detail-actions">
      <button
        className="ticket-admin-button"
        type="button"
        disabled={pending}
        onClick={() => {
          const form = new FormData();
          form.set("locale", locale);
          form.set("eventId", eventId);
          form.set("paymentId", paymentId);
          startTransition(async () => {
            try {
              const result = await fetchTicketRefundAccountAction(form);
              if (result.status === "error") {
                showToast({
                  message: errorMessages[result.code] ?? (nl ? "Rekeningnummer niet opgehaald." : "Account number not fetched."),
                  variant: "error",
                  duration: 0,
                });
              } else {
                showToast({ message: nl ? "Rekeningnummer opgehaald." : "Account number fetched.", variant: "success" });
              }
            } catch {
              showToast({
                message: nl ? "Bancontact is niet bereikbaar. Probeer het straks opnieuw." : "Bancontact could not be reached. Try again later.",
                variant: "error",
                duration: 0,
              });
            }
          });
        }}
      >
        {pending ? (nl ? "Ophalen..." : "Fetching...") : nl ? "Rekeningnummer ophalen" : "Fetch account number"}
      </button>
    </div>
  );
}
