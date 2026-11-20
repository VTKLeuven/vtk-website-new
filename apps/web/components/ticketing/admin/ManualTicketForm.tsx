"use client";

import { useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { issueManualTicketAction } from "@/app/actions/tickets";
import type { AdminLocale } from "./format";

/**
 * Een ticket met de hand uitgeven, op het tabblad Deelnemers: voor een gast,
 * een medewerker of iemand die cash betaalde. Het bedrag is standaard 0; wat
 * er buiten de site betaald werd, vul je in en telt mee in de ontvangsten.
 */
export function ManualTicketForm({
  locale,
  eventId,
  ticketTypes,
}: {
  locale: AdminLocale;
  eventId: string;
  ticketTypes: { id: string; name: string; price: string }[];
}) {
  const nl = locale === "nl";
  const [notify, setNotify] = useState(true);
  const id = (name: string) => `manual-ticket-${name}`;

  if (ticketTypes.length === 0) {
    return (
      <p className="ticket-admin-help">
        {nl
          ? "Er is nog geen actief tickettype om een ticket van te maken."
          : "There is no active ticket type to issue a ticket from yet."}
      </p>
    );
  }

  return (
    <SaveForm
      action={issueManualTicketAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Ticket aanmaken" : "Issue ticket"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={
        notify
          ? nl
            ? "Ticket aangemaakt en gemaild."
            : "Ticket issued and emailed."
          : nl
            ? "Ticket aangemaakt."
            : "Ticket issued."
      }
      errorMessages={{
        NAME_REQUIRED: nl ? "Niet aangemaakt: vul de naam van de deelnemer in." : "Not issued: enter the attendee's name.",
        INVALID_EMAIL: nl
          ? "Niet aangemaakt: dat e-mailadres klopt niet. Daar gaat het ticket naartoe."
          : "Not issued: that email address is not valid. The ticket is sent there.",
        INVALID_AMOUNT: nl
          ? "Niet aangemaakt: vul een geldig bedrag in, bijvoorbeeld 0 of 12,50 (hoogstens 1000 euro)."
          : "Not issued: enter a valid amount, for example 0 or 12.50 (at most 1000 euro).",
        TICKET_TYPE_NOT_FOUND: nl
          ? "Niet aangemaakt: dat tickettype bestaat niet meer of is gearchiveerd."
          : "Not issued: that ticket type no longer exists or is archived.",
        EVENT_CLOSED: nl
          ? "Niet aangemaakt: dit event is voorbij, geannuleerd of gearchiveerd."
          : "Not issued: this event is over, cancelled or archived.",
        SOLD_OUT: nl
          ? "Niet aangemaakt: de pot van dit tickettype zit vol. Verhoog eerst de capaciteit bij Instellingen."
          : "Not issued: the pool of this ticket type is full. Raise its capacity under Settings first.",
        MEMBER_SEATS: nl
          ? "Niet aangemaakt: de plaatsen voor leden in deze pot zijn op. Verhoog eerst het ledenplafond."
          : "Not issued: the member seats in this pool are taken. Raise the member ceiling first.",
        NON_MEMBER_SEATS: nl
          ? "Niet aangemaakt: de plaatsen voor niet-leden in deze pot zijn op. Verhoog eerst dat plafond."
          : "Not issued: the non-member seats in this pool are taken. Raise that ceiling first.",
      }}
      fallbackErrorMessage={nl ? "Het ticket is niet aangemaakt." : "The ticket was not issued."}
      onSuccess={() => setNotify(true)}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="ticket-admin-field">
        <label htmlFor={id("type")}>Tickettype</label>
        <select id={id("type")} name="ticketTypeId" required defaultValue={ticketTypes[0]?.id}>
          {ticketTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} ({type.price})
            </option>
          ))}
        </select>
      </div>
      <div className="ticket-admin-field">
        <label htmlFor={id("name")}>{nl ? "Naam deelnemer" : "Attendee name"}</label>
        <input id={id("name")} name="attendeeName" required maxLength={200} autoComplete="off" />
      </div>
      <div className="ticket-admin-field">
        <label htmlFor={id("email")}>{nl ? "E-mail deelnemer" : "Attendee email"}</label>
        <input id={id("email")} name="attendeeEmail" type="email" required autoComplete="off" />
      </div>
      <div className="ticket-admin-field">
        <label htmlFor={id("amount")}>{nl ? "Betaald bedrag (EUR)" : "Amount paid (EUR)"}</label>
        <input
          id={id("amount")}
          name="amount"
          inputMode="decimal"
          defaultValue="0"
          aria-describedby={id("amount-help")}
        />
        <span id={id("amount-help")} className="ticket-admin-help">
          {nl
            ? "0 voor een gratis ticket. Een bedrag dat buiten de site betaald werd (bv. cash), telt mee in de ontvangsten als “Manueel”; terugbetalen gebeurt dan ook met de hand."
            : "0 for a free ticket. An amount paid outside the site (e.g. cash) counts in the revenue as “Manual”; a refund is then done by hand too."}
        </span>
      </div>
      <label className="ticket-admin-check">
        <input type="checkbox" name="notify" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
        <span>
          {nl
            ? "Mail de deelnemer het ticket, zoals na een gewone bestelling"
            : "Email the ticket to the attendee, as after a regular order"}
        </span>
      </label>
    </SaveForm>
  );
}
