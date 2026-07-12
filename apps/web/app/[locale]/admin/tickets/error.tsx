"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";

type ErrorLocale = "nl" | "en";

const validationMessages: Record<string, Record<ErrorLocale, string>> = {
  INVALID_EVENT_DATES: {
    nl: "De eindtijd moet na de starttijd liggen.",
    en: "The end time must be after the start time.",
  },
  INVALID_SALES_DATES: {
    nl: "De verkoopperiode bevat ongeldige datums.",
    en: "The sales window contains invalid dates.",
  },
  TICKET_TYPE_REQUIRED_TO_PUBLISH: {
    nl: "Voeg minstens één actief tickettype toe voordat je het event publiceert.",
    en: "Add at least one active ticket type before publishing the event.",
  },
  SLUG_ALREADY_EXISTS: {
    nl: "Deze URL wordt al door een ander ticketevent gebruikt.",
    en: "This URL is already used by another ticket event.",
  },
  CAPACITY_BELOW_ALLOCATED: {
    nl: "De capaciteit kan niet lager zijn dan het aantal gereserveerde en verkochte tickets.",
    en: "Capacity cannot be lower than the number of reserved and sold tickets.",
  },
  INVALID_ORDER_LIMITS: {
    nl: "Het maximum per bestelling moet minstens gelijk zijn aan het minimum.",
    en: "The maximum per order must be at least the minimum.",
  },
  QUESTION_OPTIONS_REQUIRED: {
    nl: "Voeg minstens twee antwoordopties toe aan deze vraag.",
    en: "Add at least two answer options to this question.",
  },
  LAST_OWNER_CANNOT_BE_DEMOTED: {
    nl: "De laatste eigenaar kan niet worden gedegradeerd.",
    en: "The final owner cannot be demoted.",
  },
  LAST_OWNER_CANNOT_BE_REMOVED: {
    nl: "De laatste eigenaar kan niet worden verwijderd.",
    en: "The final owner cannot be removed.",
  },
  LAST_GATE_CANNOT_BE_DISABLED: {
    nl: "Minstens één ingang moet actief blijven.",
    en: "At least one entrance must remain active.",
  },
  INVALID_REFUND_ITEMS: {
    nl: "Selecteer minstens één geldig ticket voor de terugbetaling.",
    en: "Select at least one valid ticket for the refund.",
  },
  TICKET_NOT_REFUNDABLE: {
    nl: "Een van de geselecteerde tickets kan niet meer worden terugbetaald.",
    en: "One of the selected tickets can no longer be refunded.",
  },
  TICKET_ALREADY_CHECKED_IN: {
    nl: "Een ingecheckt ticket kan niet worden terugbetaald.",
    en: "A checked-in ticket cannot be refunded.",
  },
  REFUND_ALREADY_REQUESTED: {
    nl: "Voor een van deze tickets bestaat al een terugbetalingsaanvraag.",
    en: "A refund has already been requested for one of these tickets.",
  },
};

export default function TicketAdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const pathname = usePathname();
  const locale: ErrorLocale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "nl";
  const base = locale === "en" ? "/en" : "";
  const validationMessage = validationMessages[error.message]?.[locale];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="ticket-admin-error-state" role="alert" aria-labelledby="ticket-admin-error-title">
      <TriangleAlert aria-hidden="true" size={28} />
      <h1 id="ticket-admin-error-title">
        {validationMessage
          ? locale === "nl" ? "Wijziging niet opgeslagen" : "Changes were not saved"
          : locale === "nl" ? "Actie niet uitgevoerd" : "Action could not be completed"}
      </h1>
      <p>
        {validationMessage ?? (locale === "nl"
          ? "Er ging iets mis bij het verwerken van de actie. Probeer opnieuw; neem contact op met een beheerder als het probleem blijft optreden."
          : "Something went wrong while processing the action. Try again; contact an administrator if the problem persists.")}
      </p>
      <div className="ticket-admin-error-actions">
        <button className="ticket-admin-button" data-variant="primary" type="button" onClick={() => unstable_retry()}>
          <RefreshCw aria-hidden="true" size={15} />
          {locale === "nl" ? "Opnieuw proberen" : "Try again"}
        </button>
        <Link className="ticket-admin-button" href={`${base}/admin/tickets`}>
          <ArrowLeft aria-hidden="true" size={15} />
          {locale === "nl" ? "Naar ticketevents" : "Back to ticket events"}
        </Link>
      </div>
    </section>
  );
}
