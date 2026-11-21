"use client";

import { useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { changeTicketTypeAction } from "@/app/actions/tickets";
import type { AdminLocale } from "./format";

/**
 * Een ticket upgraden of downgraden, in het detailpaneel van een deelnemer.
 * Enkel het type wisselt; een prijsverschil regel je buiten de site, en dat
 * zegt het formulier erbij.
 */
export function ChangeTicketTypeForm({
  locale,
  eventId,
  orderItemId,
  attendeeName,
  currentTypeId,
  paid,
  ticketTypes,
}: {
  locale: AdminLocale;
  eventId: string;
  orderItemId: string;
  attendeeName: string;
  currentTypeId: string;
  /** Wat er voor dit ticket betaald werd, al opgemaakt. */
  paid: string;
  ticketTypes: { id: string; name: string; price: string }[];
}) {
  const nl = locale === "nl";
  const options = ticketTypes.filter((type) => type.id !== currentTypeId);
  const [notify, setNotify] = useState(true);
  const id = (name: string) => `change-type-${orderItemId}-${name}`;

  if (options.length === 0) {
    return (
      <p className="ticket-admin-empty-copy">
        {nl ? "Er is geen ander actief tickettype om naar te wisselen." : "There is no other active ticket type to switch to."}
      </p>
    );
  }

  return (
    <SaveForm
      action={changeTicketTypeAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Type wijzigen" : "Change type"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? `Ticket van ${attendeeName} gewijzigd.` : `${attendeeName}'s ticket changed.`}
      errorMessages={{
        SOLD_OUT: nl
          ? "Niet gewijzigd: de pot van het nieuwe type zit vol."
          : "Not changed: the pool of the new type is full.",
        TICKET_NOT_VALID: nl
          ? "Niet gewijzigd: dit ticket is niet meer geldig."
          : "Not changed: this ticket is no longer valid.",
        REFUND_ALREADY_REQUESTED: nl
          ? "Niet gewijzigd: er loopt al een terugbetaling voor dit ticket."
          : "Not changed: a refund is already under way for this ticket.",
        TICKET_TYPE_NOT_FOUND: nl
          ? "Niet gewijzigd: dat tickettype bestaat niet meer of is gearchiveerd."
          : "Not changed: that ticket type no longer exists or is archived.",
        SAME_TICKET_TYPE: nl ? "Niet gewijzigd: dat is al het type van dit ticket." : "Not changed: that already is this ticket's type.",
        ATTENDEE_NOT_FOUND: nl ? "Niet gewijzigd: deze deelnemer bestaat niet meer." : "Not changed: this attendee no longer exists.",
      }}
      fallbackErrorMessage={nl ? "Het ticket is niet gewijzigd." : "The ticket was not changed."}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <div className="ticket-admin-field">
        <label htmlFor={id("type")}>{nl ? "Nieuw tickettype" : "New ticket type"}</label>
        <select id={id("type")} name="ticketTypeId" required defaultValue={options[0].id} aria-describedby={id("help")}>
          {options.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} ({type.price})
            </option>
          ))}
        </select>
        <span id={id("help")} className="ticket-admin-help">
          {nl
            ? `Er werd ${paid} betaald, en dat blijft zo: een prijsverschil regel je buiten de site (bijbetalen aan de toog, of met de hand terugstorten). Het ticket en de QR-code blijven dezelfde.`
            : `${paid} was paid, and that stays: settle a price difference outside the site (pay extra at the bar, or refund by hand). The ticket and QR code stay the same.`}
        </span>
      </div>
      <label className="ticket-admin-check">
        <input type="checkbox" name="notify" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
        <span>{nl ? "Mail de koper over de wijziging" : "Email the buyer about the change"}</span>
      </label>
      {notify ? (
        <div className="ticket-admin-field">
          <label htmlFor={id("message")}>{nl ? "Bericht (optioneel)" : "Message (optional)"}</label>
          <textarea
            id={id("message")}
            name="message"
            rows={3}
            maxLength={2000}
            placeholder={nl ? "Bv. betaal het verschil van €5 aan de inkom." : "E.g. pay the €5 difference at the entrance."}
          />
        </div>
      ) : null}
    </SaveForm>
  );
}
