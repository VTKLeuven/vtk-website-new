"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Rocket } from "lucide-react";
import { publishTicketEventAction } from "@/app/actions/tickets";
import type { AdminLocale } from "./format";

const T = {
  nl: {
    draft: "Dit event staat in concept: er is nog niets te koop.",
    publish: "Publiceren",
    publishing: "Publiceren...",
    published: "Dit event staat live in de ticketshop.",
    view: "Bekijk de ticketpagina",
    needsType:
      "Voeg eerst een actief tickettype toe; zonder ticket valt er niets te verkopen.",
    forbidden: "Je hebt geen rechten om dit event te publiceren.",
    failed: "Publiceren is mislukt. Probeer het opnieuw.",
    otherStatus: "Status:",
  },
  en: {
    draft: "This event is a draft: nothing is on sale yet.",
    publish: "Publish",
    publishing: "Publishing...",
    published: "This event is live in the ticket shop.",
    view: "View the ticket page",
    needsType: "Add an active ticket type first; without a ticket there is nothing to sell.",
    forbidden: "You do not have permission to publish this event.",
    failed: "Publishing failed. Please try again.",
    otherStatus: "Status:",
  },
} as const;

/**
 * Statusbalk boven de eventinstellingen, met publiceren als één knop.
 *
 * Staat bewust los van het grote instellingenformulier: publiceren is een
 * beslissing op zich, en hoort niet weggestopt te zitten in een keuzelijst die je
 * pas na "Wijzigingen opslaan" iets vertelt.
 */
export function TicketPublishBar({
  eventId,
  status,
  slug,
  hasActiveTicketType,
  locale,
}: {
  eventId: string;
  status: string;
  slug: string;
  hasActiveTicketType: boolean;
  locale: AdminLocale;
}) {
  const t = T[locale];
  const base = locale === "nl" ? "" : "/en";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function publish() {
    setError(null);
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("locale", locale);
    startTransition(async () => {
      try {
        const result = await publishTicketEventAction(form);
        if (!result.ok) {
          setError(result.error === "FORBIDDEN" ? t.forbidden : t.needsType);
        }
      } catch {
        setError(t.failed);
      }
    });
  }

  if (status === "PUBLISHED") {
    return (
      <div className="ticket-admin-alert" data-tone="success" role="status">
        <CheckCircle2 aria-hidden="true" size={17} />
        <span>
          {t.published}{" "}
          <a className="ticket-admin-alert-link" href={`${base}/tickets/${slug}`}>
            {t.view}
          </a>
        </span>
      </div>
    );
  }

  if (status !== "DRAFT") {
    return (
      <div className="ticket-admin-alert" data-tone="info" role="status">
        <span>
          {t.otherStatus} {status}
        </span>
      </div>
    );
  }

  return (
    <div className="ticket-admin-publish-bar">
      <div className="ticket-admin-publish-text">
        <strong>{t.draft}</strong>
        {/* De blokkade staat er vóór je klikt, niet als foutmelding erna. */}
        {!hasActiveTicketType ? <span>{t.needsType}</span> : null}
        {error ? (
          <span className="ticket-admin-publish-error" role="alert">
            <AlertTriangle aria-hidden="true" size={14} />
            {error}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="ticket-admin-button"
        data-variant="primary"
        onClick={publish}
        disabled={pending || !hasActiveTicketType}
        title={hasActiveTicketType ? undefined : t.needsType}
      >
        {pending ? (
          <LoaderCircle className="is-spinning" aria-hidden="true" size={16} />
        ) : (
          <Rocket aria-hidden="true" size={16} />
        )}
        {pending ? t.publishing : t.publish}
      </button>
    </div>
  );
}
