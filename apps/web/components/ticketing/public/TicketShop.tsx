"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Mail,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Ticket,
  TicketX,
  UserRound,
} from "lucide-react";
import {
  formatTicketDate,
  formatTicketPrice,
  maximumSelectableForType,
  nextTicketQuantity,
  type SerializedTicketEvent,
  type TicketQuestion,
} from "./types";

type Attendee = {
  attendeeName: string;
  attendeeEmail: string;
  answers: Record<string, string | string[] | boolean>;
};

type CheckoutResponse = {
  orderId?: string;
  checkoutUrl?: string;
  url?: string;
  checkout?: { url?: string };
  error?: string;
  message?: string;
};

function emptyAttendee(): Attendee {
  return { attendeeName: "", attendeeEmail: "", answers: {} };
}

function checkoutErrorMessage(code: string | undefined, locale: "nl" | "en"): string {
  const messages: Record<string, { nl: string; en: string }> = {
    EVENT_NOT_ON_SALE: { nl: "De ticketverkoop is niet geopend.", en: "Ticket sales are not open." },
    INVALID_TICKET_TYPE: { nl: "Een gekozen tickettype is niet meer beschikbaar.", en: "A selected ticket type is no longer available." },
    LOGIN_REQUIRED: { nl: "Log in om deze bestelling af te ronden.", en: "Sign in to complete this order." },
    INVALID_QUANTITY: { nl: "Controleer het gekozen aantal tickets.", en: "Check the selected ticket quantity." },
    INVALID_ANSWER: { nl: "Controleer de antwoorden bij de aanwezigen.", en: "Check the attendee answers." },
    TOO_MANY_RESERVATIONS: { nl: "Er staan al meerdere reservaties open. Probeer later opnieuw.", en: "Several reservations are already pending. Try again later." },
    FREE_TICKET_LIMIT: { nl: "Je hebt het maximum aantal gratis tickets voor dit event bereikt.", en: "You have reached the free-ticket limit for this event." },
    SOLD_OUT: { nl: "Deze tickets zijn net uitverkocht.", en: "These tickets have just sold out." },
    PAYMENT_UNAVAILABLE: { nl: "De betaalpagina is tijdelijk niet bereikbaar. Probeer straks opnieuw.", en: "The payment page is temporarily unavailable. Try again shortly." },
    REQUEST_BODY_TOO_LARGE: { nl: "De bestelling bevat te veel gegevens.", en: "The order contains too much data." },
  };
  const fallback = locale === "nl" ? "Bestellen is mislukt. Probeer opnieuw." : "Checkout failed. Please try again.";
  return code ? messages[code]?.[locale] ?? fallback : fallback;
}

function QuestionField({
  question,
  fieldPrefix,
  value,
  onChange,
  locale,
}: {
  question: TicketQuestion;
  fieldPrefix: string;
  value: string | string[] | boolean | undefined;
  onChange: (value: string | string[] | boolean) => void;
  locale: "nl" | "en";
}) {
  const fieldId = `${fieldPrefix}-question-${question.id}`;
  const descriptionId = question.description ? `${fieldId}-description` : undefined;
  const type = question.type ?? "TEXT";

  const options = (question.options ?? []).map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : { value: option.value, label: option.label ?? option.value },
  );

  if (type === "BOOLEAN") {
    return (
      <fieldset className="ticket-choice-field" aria-required={question.required}>
        <legend>{question.label}{question.required ? " *" : ""}</legend>
        <div className="ticket-choice-list ticket-boolean-options">
          <label htmlFor={`${fieldId}-yes`}>
            <input
              id={`${fieldId}-yes`}
              name={fieldId}
              type="radio"
              checked={value === true}
              required={question.required}
              aria-describedby={descriptionId}
              onChange={() => onChange(true)}
            />
            {locale === "nl" ? "Ja" : "Yes"}
          </label>
          <label htmlFor={`${fieldId}-no`}>
            <input
              id={`${fieldId}-no`}
              name={fieldId}
              type="radio"
              checked={value === false}
              required={question.required}
              aria-describedby={descriptionId}
              onChange={() => onChange(false)}
            />
            {locale === "nl" ? "Nee" : "No"}
          </label>
        </div>
        {question.description ? <small id={descriptionId}>{question.description}</small> : null}
      </fieldset>
    );
  }

  if (type === "CHECKBOX") {
    return (
      <label className="ticket-checkbox" htmlFor={fieldId}>
        <input
          id={fieldId}
          type="checkbox"
          checked={value === true}
          required={question.required}
          aria-describedby={descriptionId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <strong>{question.label}</strong>
          {question.description ? <small id={descriptionId}>{question.description}</small> : null}
        </span>
      </label>
    );
  }

  if (type === "MULTIPLE_CHOICE") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="ticket-choice-field" aria-required={question.required}>
        <legend>{question.label}{question.required ? " *" : ""}</legend>
        <div className="ticket-choice-list">
          {options.map((option, index) => (
            <label key={option.value} htmlFor={`${fieldId}-${index}`}>
              <input
                id={`${fieldId}-${index}`}
                type="checkbox"
                checked={selected.includes(option.value)}
                required={question.required && selected.length === 0 && index === 0}
                aria-describedby={descriptionId}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value),
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
        {question.description ? <small id={descriptionId}>{question.description}</small> : null}
      </fieldset>
    );
  }

  return (
    <label className="ticket-field" htmlFor={fieldId}>
      <span>
        {question.label}
        {question.required ? " *" : ""}
      </span>
      {type === "SELECT" || type === "SINGLE_CHOICE" ? (
        <select
          id={fieldId}
          required={question.required}
          aria-describedby={descriptionId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{locale === "nl" ? "Selecteer" : "Select"}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === "LONG_TEXT" ? (
        <textarea
          id={fieldId}
          rows={4}
          required={question.required}
          aria-describedby={descriptionId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={fieldId}
          type={type === "EMAIL" ? "email" : "text"}
          required={question.required}
          aria-describedby={descriptionId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {question.description ? <small id={descriptionId}>{question.description}</small> : null}
    </label>
  );
}

export function TicketShop({
  event,
  locale,
}: {
  event: SerializedTicketEvent;
  locale: "nl" | "en";
}) {
  const router = useRouter();
  const base = locale === "nl" ? "" : "/en";
  const loginHref = `${base}/inloggen?next=${encodeURIComponent(`${base}/tickets/${event.slug}`)}`;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [buyerName, setBuyerName] = useState(event.viewer?.name ?? "");
  const [buyerEmail, setBuyerEmail] = useState(event.viewer?.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  );
  const totalCents = useMemo(
    () =>
      event.ticketTypes.reduce(
        (sum, type) => sum + (quantities[type.id] ?? 0) * type.priceCents,
        0,
      ),
    [event.ticketTypes, quantities],
  );

  const now = new Date(event.currentTime).getTime();
  const beforeSales = event.salesStart ? new Date(event.salesStart).getTime() > now : false;
  const afterSales = event.salesEnd ? new Date(event.salesEnd).getTime() <= now : false;
  const salesOpen = event.status === "PUBLISHED" && !beforeSales && !afterSales;

  function setQuantity(ticketTypeId: string, next: number) {
    const type = event.ticketTypes.find((candidate) => candidate.id === ticketTypeId);
    if (!type) return;
    const maximum = maximumSelectableForType({
      type,
      ticketTypes: event.ticketTypes,
      quantities,
      maxTicketsPerOrder: event.maxTicketsPerOrder,
    });
    const minimum = type.minPerOrder ?? 1;
    const bounded = next < minimum || maximum < minimum
      ? 0
      : Math.min(next, maximum);

    setQuantities((values) => ({ ...values, [ticketTypeId]: bounded }));
    setAttendees((values) => {
      const currentAttendees = values[ticketTypeId] ?? [];
      return {
        ...values,
        [ticketTypeId]: Array.from(
          { length: bounded },
          (_, index) => currentAttendees[index] ?? emptyAttendee(),
        ),
      };
    });
    setError(null);
  }

  function updateAttendee(ticketTypeId: string, index: number, update: Partial<Attendee>) {
    setAttendees((values) => ({
      ...values,
      [ticketTypeId]: (values[ticketTypeId] ?? []).map((attendee, attendeeIndex) =>
        attendeeIndex === index ? { ...attendee, ...update } : attendee,
      ),
    }));
  }

  async function submitCheckout(event_: FormEvent<HTMLFormElement>) {
    event_.preventDefault();
    if (selectedCount < 1 || submitting) {
      setError(locale === "nl" ? "Kies minstens één ticket." : "Choose at least one ticket.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const items = event.ticketTypes.flatMap((type) =>
      (attendees[type.id] ?? []).map((attendee) => ({
        ticketTypeId: type.id,
        attendeeName: attendee.attendeeName.trim(),
        attendeeEmail: attendee.attendeeEmail.trim(),
        answers: attendee.answers,
      })),
    );

    try {
      const response = await fetch("/api/tickets/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          locale,
          termsAccepted: true,
          items,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CheckoutResponse;
      if (!response.ok) {
        throw new Error(payload.message ?? checkoutErrorMessage(payload.error, locale));
      }

      const checkoutUrl = payload.checkoutUrl ?? payload.url ?? payload.checkout?.url;
      if (checkoutUrl) {
        window.location.assign(checkoutUrl);
        return;
      }
      if (payload.orderId) {
        router.push(`${base}/tickets/bestelling/${payload.orderId}`);
        return;
      }
      throw new Error(locale === "nl" ? "De betaalpagina ontbreekt in het antwoord." : "The payment page is missing from the response.");
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : locale === "nl"
            ? "Bestellen is mislukt. Probeer opnieuw."
            : "Checkout failed. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form className={`ticket-shop-layout${event.ticketTypes.length === 0 ? " is-empty" : ""}`} onSubmit={submitCheckout}>
      <div className="ticket-shop-main">
        <section className="ticket-shop-section" aria-labelledby="ticket-types-heading">
          <div className="ticket-section-heading">
            <span>01</span>
            <div>
              <h2 id="ticket-types-heading">{locale === "nl" ? "Kies je tickets" : "Choose your tickets"}</h2>
              <p>
                {locale === "nl"
                  ? `Maximum ${event.maxTicketsPerOrder} tickets per bestelling.`
                  : `Maximum ${event.maxTicketsPerOrder} tickets per order.`}
              </p>
            </div>
          </div>

          {event.ticketTypes.length === 0 ? (
            <div className="ticket-shop-empty-state">
              <TicketX size={27} aria-hidden="true" />
              <h3>
                {event.requiresLogin
                  ? locale === "nl" ? "Log in om tickets te bestellen" : "Sign in to order tickets"
                  : locale === "nl" ? "Geen tickets beschikbaar" : "No tickets available"}
              </h3>
              <p>
                {event.requiresLogin
                  ? locale === "nl"
                    ? "Voor de beschikbare tickets moet je ingelogd zijn."
                    : "You need to sign in for the available tickets."
                  : locale === "nl"
                    ? "Er zijn momenteel geen tickettypes beschikbaar voor dit event."
                    : "There are currently no ticket types available for this event."}
              </p>
              {event.requiresLogin ? (
                <Link className="ticket-primary-button" href={loginHref}>
                  <LogIn size={17} aria-hidden="true" />
                  {locale === "nl" ? "Inloggen" : "Sign in"}
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="ticket-type-list">
              {event.ticketTypes.filter((type) => type.active).map((type) => {
                const quantity = quantities[type.id] ?? 0;
                const soldOut = type.available < 1;
                const max = maximumSelectableForType({
                  type,
                  ticketTypes: event.ticketTypes,
                  quantities,
                  maxTicketsPerOrder: event.maxTicketsPerOrder,
                });
                const belowMinimum = max < (type.minPerOrder ?? 1);
                const typeBeforeSales = type.salesStart
                  ? new Date(type.salesStart).getTime() > now
                  : false;
                const typeAfterSales = type.salesEnd
                  ? new Date(type.salesEnd).getTime() <= now
                  : false;
                const typeSalesOpen = salesOpen && !typeBeforeSales && !typeAfterSales;
                const unavailable = soldOut || !typeSalesOpen || belowMinimum;
                let availabilityText: string;

                if (soldOut) {
                  availabilityText = locale === "nl"
                    ? "Geen tickets meer beschikbaar"
                    : "No tickets remaining";
                } else if (typeBeforeSales) {
                  availabilityText = locale === "nl"
                    ? `Verkoop start op ${formatTicketDate(type.salesStart!, locale)}`
                    : `Sales start on ${formatTicketDate(type.salesStart!, locale)}`;
                } else if (typeAfterSales) {
                  availabilityText = locale === "nl"
                    ? "De verkoop voor dit tickettype is gesloten"
                    : "Sales for this ticket type are closed";
                } else if (belowMinimum) {
                  availabilityText = locale === "nl"
                    ? `Onvoldoende beschikbaar voor het minimum van ${type.minPerOrder ?? 1}`
                    : `Not enough availability for the minimum of ${type.minPerOrder ?? 1}`;
                } else {
                  availabilityText = locale === "nl"
                    ? `${type.available} beschikbaar${max < type.available ? ` · max. ${max}` : ""}`
                    : `${type.available} available${max < type.available ? ` · max. ${max}` : ""}`;
                }

                return (
                  <article className={`ticket-type-row${unavailable ? " is-disabled" : ""}`} key={type.id}>
                    <div className="ticket-type-copy">
                      <div className="ticket-type-title">
                        <h3>{type.name}</h3>
                        {soldOut ? (
                          <span>{locale === "nl" ? "Uitverkocht" : "Sold out"}</span>
                        ) : typeBeforeSales ? (
                          <span className="is-upcoming">
                            {locale === "nl" ? "Binnenkort" : "Coming soon"}
                          </span>
                        ) : typeAfterSales ? (
                          <span>{locale === "nl" ? "Gesloten" : "Closed"}</span>
                        ) : null}
                      </div>
                      {type.description ? <p>{type.description}</p> : null}
                      <small>{availabilityText}</small>
                    </div>
                    <strong className="ticket-type-price">
                      {formatTicketPrice(type.priceCents, event.currency, locale)}
                    </strong>
                    <div className="ticket-stepper" aria-label={`${type.name}: ${quantity}`}>
                      <button
                        type="button"
                        title={locale === "nl" ? "Eén minder" : "Decrease"}
                        aria-label={locale === "nl" ? `Minder ${type.name}` : `Decrease ${type.name}`}
                        disabled={quantity === 0 || !typeSalesOpen}
                        onClick={() =>
                          setQuantity(
                            type.id,
                            nextTicketQuantity({
                              current: quantity,
                              direction: "decrease",
                              minimum: type.minPerOrder ?? 1,
                              maximum: max,
                            }),
                          )
                        }
                      >
                        <Minus size={17} aria-hidden="true" />
                      </button>
                      <output>{quantity}</output>
                      <button
                        type="button"
                        title={locale === "nl" ? "Eén meer" : "Increase"}
                        aria-label={locale === "nl" ? `Meer ${type.name}` : `Increase ${type.name}`}
                        disabled={
                          soldOut ||
                          !typeSalesOpen ||
                          belowMinimum ||
                          quantity >= max ||
                          selectedCount >= event.maxTicketsPerOrder
                        }
                        onClick={() =>
                          setQuantity(
                            type.id,
                            nextTicketQuantity({
                              current: quantity,
                              direction: "increase",
                              minimum: type.minPerOrder ?? 1,
                              maximum: max,
                            }),
                          )
                        }
                      >
                        <Plus size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!salesOpen ? (
            <div className="ticket-notice">
              <AlertCircle size={19} aria-hidden="true" />
              <span>
                {beforeSales
                  ? locale === "nl"
                    ? `De verkoop start op ${formatTicketDate(event.salesStart!, locale)}.`
                    : `Sales start on ${formatTicketDate(event.salesStart!, locale)}.`
                  : locale === "nl"
                    ? "De ticketverkoop is gesloten."
                    : "Ticket sales are closed."}
              </span>
            </div>
          ) : null}
        </section>

        {selectedCount > 0 ? (
          <section className="ticket-shop-section" aria-labelledby="attendees-heading">
            <div className="ticket-section-heading">
              <span>02</span>
              <div>
                <h2 id="attendees-heading">{locale === "nl" ? "Gegevens aanwezigen" : "Attendee details"}</h2>
                <p>{locale === "nl" ? "Elk ticket wordt op naam gezet." : "Each ticket is issued to one attendee."}</p>
              </div>
            </div>

            <div className="ticket-attendee-list">
              {event.ticketTypes.flatMap((type) =>
                (attendees[type.id] ?? []).map((attendee, index) => (
                  <fieldset className="ticket-attendee" key={`${type.id}-${index}`}>
                    <legend>
                      <Ticket size={16} aria-hidden="true" />
                      {type.name} · {index + 1}
                    </legend>
                    <div className="ticket-fields-grid">
                      <label className="ticket-field">
                        <span>{locale === "nl" ? "Naam aanwezige" : "Attendee name"} *</span>
                        <div className="ticket-input-icon">
                          <UserRound size={17} aria-hidden="true" />
                          <input
                            value={attendee.attendeeName}
                            autoComplete="name"
                            required
                            onChange={(event_) => updateAttendee(type.id, index, { attendeeName: event_.target.value })}
                          />
                        </div>
                      </label>
                      <label className="ticket-field">
                        <span>{locale === "nl" ? "E-mail aanwezige" : "Attendee email"} *</span>
                        <div className="ticket-input-icon">
                          <Mail size={17} aria-hidden="true" />
                          <input
                            type="email"
                            value={attendee.attendeeEmail}
                            autoComplete="email"
                            required
                            onChange={(event_) => updateAttendee(type.id, index, { attendeeEmail: event_.target.value })}
                          />
                        </div>
                      </label>
                      {(type.questions ?? []).map((question) => (
                        <QuestionField
                          key={question.id}
                          question={question}
                          fieldPrefix={`${type.id}-${index}`}
                          value={attendee.answers[question.id]}
                          locale={locale}
                          onChange={(value) =>
                            updateAttendee(type.id, index, {
                              answers: { ...attendee.answers, [question.id]: value },
                            })
                          }
                        />
                      ))}
                    </div>
                  </fieldset>
                )),
              )}
            </div>
          </section>
        ) : null}

        {selectedCount > 0 ? (
          <section className="ticket-shop-section" aria-labelledby="buyer-heading">
            <div className="ticket-section-heading">
              <span>03</span>
              <div>
                <h2 id="buyer-heading">{locale === "nl" ? "Gegevens koper" : "Buyer details"}</h2>
                <p>{locale === "nl" ? "Hier sturen we de bestelling naartoe." : "We will send the order here."}</p>
              </div>
            </div>
            <div className="ticket-fields-grid">
              <label className="ticket-field">
                <span>{locale === "nl" ? "Volledige naam" : "Full name"} *</span>
                <div className="ticket-input-icon">
                  <UserRound size={17} aria-hidden="true" />
                  <input value={buyerName} autoComplete="name" required onChange={(event_) => setBuyerName(event_.target.value)} />
                </div>
              </label>
              <label className="ticket-field">
                <span>{locale === "nl" ? "E-mailadres" : "Email address"} *</span>
                <div className="ticket-input-icon">
                  <Mail size={17} aria-hidden="true" />
                  <input type="email" value={buyerEmail} autoComplete="email" required onChange={(event_) => setBuyerEmail(event_.target.value)} />
                </div>
              </label>
            </div>
          </section>
        ) : null}
      </div>

      {event.ticketTypes.length > 0 ? (
        <aside className="ticket-order-summary">
          <div className="ticket-order-summary-head">
            <span>{locale === "nl" ? "Bestelling" : "Order"}</span>
            <strong>{selectedCount}</strong>
          </div>
          <div className="ticket-order-event">
            <h2>{event.title}</h2>
            <p><CalendarDays size={16} aria-hidden="true" /> {formatTicketDate(event.startsAt, locale)}</p>
            <p><MapPin size={16} aria-hidden="true" /> {event.location ?? (locale === "nl" ? "Locatie volgt" : "Location to be announced")}</p>
          </div>
          <div className="ticket-order-lines">
            {event.ticketTypes.map((type) => {
              const quantity = quantities[type.id] ?? 0;
              return quantity > 0 ? (
                <div key={type.id}>
                  <span>{quantity} × {type.name}</span>
                  <strong>{formatTicketPrice(quantity * type.priceCents, event.currency, locale)}</strong>
                </div>
              ) : null;
            })}
            {selectedCount === 0 ? (
              <p>{locale === "nl" ? "Nog geen tickets geselecteerd" : "No tickets selected yet"}</p>
            ) : null}
          </div>
          <div className="ticket-order-total">
            <span>{locale === "nl" ? "Totaal" : "Total"}</span>
            <strong>{formatTicketPrice(totalCents, event.currency, locale)}</strong>
          </div>
          {selectedCount > 0 ? (
            <label className="ticket-checkbox ticket-terms-check">
              <input type="checkbox" required />
              <span>
                <strong>
                  {locale === "nl"
                    ? "Ik ga akkoord met de verkoop- en terugbetalingsvoorwaarden."
                    : "I agree to the sales and refund terms."}
                </strong>
                {event.termsUrl ? (
                  <small>
                    <a href={event.termsUrl} target="_blank" rel="noreferrer">
                      {locale === "nl" ? "Lees de voorwaarden" : "Read the terms"}
                    </a>
                  </small>
                ) : null}
              </span>
            </label>
          ) : null}
          {error ? <div className="ticket-error" role="alert"><AlertCircle size={17} aria-hidden="true" /> {error}</div> : null}
          <button className="ticket-checkout-button" type="submit" disabled={!salesOpen || selectedCount === 0 || submitting}>
            {submitting ? <LoaderCircle className="is-spinning" size={19} aria-hidden="true" /> : <LockKeyhole size={18} aria-hidden="true" />}
            {submitting
              ? locale === "nl" ? "Betaalpagina openen…" : "Opening checkout…"
              : locale === "nl" ? "Veilig betalen" : "Secure checkout"}
            {!submitting ? <ChevronRight size={18} aria-hidden="true" /> : null}
          </button>
          <div className="ticket-order-trust">
            <span><ShieldCheck size={15} aria-hidden="true" /> {locale === "nl" ? "Beveiligde betaling" : "Secure payment"}</span>
            <span><Check size={15} aria-hidden="true" /> {locale === "nl" ? "Ticket per e-mail" : "Ticket by email"}</span>
          </div>
        </aside>
      ) : null}
    </form>
  );
}
