"use client";

import { refundTicketsAction } from "@/app/actions/tickets";
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
}: {
  eventId: string;
  orderId: string;
  items: RefundableItem[];
  currency: string;
  locale: AdminLocale;
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
