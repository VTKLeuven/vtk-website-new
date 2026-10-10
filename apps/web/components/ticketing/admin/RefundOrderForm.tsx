"use client";

import { refundTicketsAction, refundTicketsManuallyAction } from "@/app/actions/tickets";
import { SaveForm } from "@/components/ui/SaveForm";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatMoney, type AdminLocale } from "./format";

type RefundableItem = {
  id: string;
  attendeeName: string;
  ticketTypeName: string;
  totalCents: number;
  ticket: { status: string; checkedInAt: Date | null } | null;
  refundItems?: { id: string }[];
};

export function RefundOrderForm({
  eventId,
  orderId,
  items,
  currency,
  locale,
  manual = false,
}: {
  eventId: string;
  orderId: string;
  items: RefundableItem[];
  currency: string;
  locale: AdminLocale;
  /**
   * Bancontact: er gaat niets naar de provider. Het beheer stortte het geld
   * zelf terug en boekt hier enkel de tickets als terugbetaald.
   */
  manual?: boolean;
}) {
  const refundableItems = items.filter(
    (item) =>
      item.ticket?.status === "VALID" &&
      !item.ticket.checkedInAt &&
      (item.refundItems?.length ?? 0) === 0
  );
  const [hasSelection, setHasSelection] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const selectionErrorId = `refund-selection-error-${orderId}`;

  function handleSelectionChange(form: HTMLFormElement | null) {
    const selected = Boolean(
      form?.querySelector<HTMLInputElement>('input[name="orderItemId"]:checked')
    );
    setHasSelection(selected);
    if (selected) setSelectionError(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (event.currentTarget.querySelector('input[name="orderItemId"]:checked')) return;

    event.preventDefault();
    setSelectionError(true);
    event.currentTarget
      .querySelector<HTMLInputElement>('input[name="orderItemId"]')
      ?.focus();
  }

  if (refundableItems.length === 0) {
    return (
      <p className="ticket-admin-help">
        {locale === "nl"
          ? "Er zijn geen terugbetaalbare tickets in deze bestelling."
          : "There are no refundable tickets in this order."}
      </p>
    );
  }

  if (manual) {
    const nl = locale === "nl";
    return (
      <SaveForm
        action={refundTicketsManuallyAction}
        className="ticket-admin-form"
        submitLabel={nl ? "Markeer als terugbetaald" : "Mark as refunded"}
        savingLabel={nl ? "Bezig..." : "Saving..."}
        savedMessage={nl ? "Tickets gemarkeerd als terugbetaald." : "Tickets marked as refunded."}
        fallbackErrorMessage={nl ? "Tickets niet gemarkeerd als terugbetaald." : "Tickets were not marked as refunded."}
        errorMessages={
          nl
            ? {
                INVALID_REFUND_ITEMS: "Niets gemarkeerd: selecteer minstens één ticket.",
                REASON_REQUIRED: "Niets gemarkeerd: geef een reden op.",
                TICKET_NOT_REFUNDABLE: "Niets gemarkeerd: een van de tickets is niet meer geldig.",
                TICKET_ALREADY_CHECKED_IN: "Niets gemarkeerd: een van de tickets is al gescand aan de ingang.",
                REFUND_ALREADY_REQUESTED: "Niets gemarkeerd: een van de tickets is al terugbetaald. Misschien deed een collega het net.",
                REFUND_NOT_MANUAL: "Niets gemarkeerd: deze bestelling is niet met Bancontact betaald en wordt via Mollie terugbetaald.",
              }
            : {
                INVALID_REFUND_ITEMS: "Nothing marked: select at least one ticket.",
                REASON_REQUIRED: "Nothing marked: give a reason.",
                TICKET_NOT_REFUNDABLE: "Nothing marked: one of the tickets is no longer valid.",
                TICKET_ALREADY_CHECKED_IN: "Nothing marked: one of the tickets was already scanned at the entrance.",
                REFUND_ALREADY_REQUESTED: "Nothing marked: one of the tickets was already refunded. A colleague may have just done it.",
                REFUND_NOT_MANUAL: "Nothing marked: this order was not paid with Bancontact and is refunded through Mollie.",
              }
        }
        confirmSubmit={{
          title: nl ? "Markeren als terugbetaald?" : "Mark as refunded?",
          description: nl
            ? "Dit stort niets terug: doe eerst de overschrijving naar het rekeningnummer hierboven. Daarna vervallen de geselecteerde tickets (ze werken niet meer aan de ingang) en komen hun plaatsen weer vrij. De andere tickets van de bestelling blijven geldig."
            : "This does not transfer any money: make the transfer to the account number above first. The selected tickets are then voided (they no longer work at the entrance) and their places become available again. The other tickets in the order stay valid.",
          confirmLabel: nl ? "Markeer als terugbetaald" : "Mark as refunded",
          cancelLabel: nl ? "Annuleren" : "Cancel",
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="orderId" value={orderId} />
        <fieldset className="ticket-admin-field">
          <legend className="ticket-admin-label">
            {nl ? "Welke tickets betaalde je terug?" : "Which tickets did you refund?"}
          </legend>
          {refundableItems.map((item) => (
            <label className="ticket-admin-check" key={item.id}>
              <input type="checkbox" name="orderItemId" value={item.id} />
              <span>
                {item.attendeeName} · {item.ticketTypeName} · {formatMoney(item.totalCents, currency, locale)}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="ticket-admin-field">
          <label htmlFor={`manual-refund-reason-${orderId}`}>{nl ? "Reden" : "Reason"}</label>
          <textarea id={`manual-refund-reason-${orderId}`} name="reason" rows={2} required />
        </div>
      </SaveForm>
    );
  }

  return (
    <form action={refundTicketsAction} className="ticket-admin-form" onSubmit={handleSubmit}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset
        className="ticket-admin-field"
        aria-describedby={selectionError ? selectionErrorId : undefined}
        aria-invalid={selectionError || undefined}
      >
        <legend className="ticket-admin-label">
          {locale === "nl" ? "Selecteer minstens één ticket" : "Select at least one ticket"}
        </legend>
        {refundableItems.map((item, index) => (
          <label className="ticket-admin-check" key={item.id}>
            <input
              type="checkbox"
              name="orderItemId"
              value={item.id}
              required={index === 0 && !hasSelection}
              aria-describedby={index === 0 && selectionError ? selectionErrorId : undefined}
              onChange={(event) => handleSelectionChange(event.currentTarget.form)}
              onInvalid={index === 0 ? () => setSelectionError(true) : undefined}
            />
            <span>
              {item.attendeeName} · {item.ticketTypeName} · {formatMoney(item.totalCents, currency, locale)}
            </span>
          </label>
        ))}
      </fieldset>
      {selectionError ? (
        <p className="ticket-admin-inline-error" id={selectionErrorId} role="alert">
          <AlertTriangle aria-hidden="true" size={15} />
          {locale === "nl"
            ? "Selecteer minstens één ticket om terug te betalen."
            : "Select at least one ticket to refund."}
        </p>
      ) : null}
      <div className="ticket-admin-field">
        <label htmlFor={`refund-reason-${orderId}`}>{locale === "nl" ? "Reden" : "Reason"}</label>
        <textarea id={`refund-reason-${orderId}`} name="reason" rows={2} required />
      </div>
      <div className="ticket-admin-alert" data-tone="danger">
        <AlertTriangle aria-hidden="true" size={17} />
        <span>
          {locale === "nl"
            ? "Na een geslaagde terugbetaling zijn de geselecteerde tickets niet meer geldig aan de ingang."
            : "After a successful refund, the selected tickets are no longer valid at the entrance."}
        </span>
      </div>
      <button className="ticket-admin-button" data-variant="danger" type="submit">
        <RotateCcw aria-hidden="true" size={15} />
        {locale === "nl" ? "Terugbetaling starten" : "Start refund"}
      </button>
    </form>
  );
}
