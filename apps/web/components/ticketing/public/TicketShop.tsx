"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "@/components/ui/Link";
import { PaymentMethodChooser, type PaymentMethodChoice } from "./PaymentMethodChooser";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Mail,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Ticket,
  TicketX,
  UserRound,
} from "lucide-react";
import {
  formatTicketDate,
  formatTicketPrice,
  maximumSelectableForLine,
  nextTicketQuantity,
  quantitiesByTicketType,
  ticketLinesForType,
  type SerializedTicketEvent,
  type TicketLine,
  type TicketQuestion,
} from "./types";
import { trackCheckoutStart } from "@/lib/analytics-client";

export type Attendee = {
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

function emptyAttendee(viewer?: { name: string; email: string } | null): Attendee {
  return {
    attendeeName: viewer?.name ?? "",
    attendeeEmail: viewer?.email ?? "",
    answers: {},
  };
}

export function attendeesForQuantity(
  values: Record<string, Attendee[]>,
  ticketTypeId: string,
  quantity: number,
  viewer?: { name: string; email: string } | null,
): Attendee[] {
  const currentAttendees = values[ticketTypeId] ?? [];
  let prefillBuyer = Boolean(viewer) && Object.values(values).every((list) => list.length === 0);
  return Array.from({ length: quantity }, (_, index) => {
    if (currentAttendees[index]) return currentAttendees[index];
    if (prefillBuyer) {
      prefillBuyer = false;
      return emptyAttendee(viewer);
    }
    return emptyAttendee();
  });
}

function checkoutErrorMessage(code: string | undefined, locale: "nl" | "en"): string {
  const messages: Record<string, { nl: string; en: string }> = {
    EVENT_NOT_ON_SALE: { nl: "De ticketverkoop is niet geopend.", en: "Ticket sales are not open." },
    INVALID_TICKET_TYPE: { nl: "Een gekozen tickettype is niet meer beschikbaar.", en: "A selected ticket type is no longer available." },
    LOGIN_REQUIRED: { nl: "Log in om deze bestelling af te ronden.", en: "Sign in to complete this order." },
    MEMBERSHIP_REQUIRED: { nl: "Dit ticket is er voor leden van VTK.", en: "This ticket is for members of VTK." },
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
/** Onder dit aantal zegt de shop hoeveel er nog zijn; daarboven helpt het getal niemand kiezen. */
const LOW_STOCK = 20;

function TicketStepper({
  label,
  quantity,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  locale,
}: {
  label: string;
  quantity: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  locale: "nl" | "en";
}) {
  return (
    <div className="tshop-stepper" data-active={quantity > 0} role="group" aria-label={`${label}: ${quantity}`}>
      <button
        type="button"
        title={locale === "nl" ? "Eén minder" : "Decrease"}
        aria-label={locale === "nl" ? `Minder ${label}` : `Decrease ${label}`}
        disabled={!canDecrease}
        onClick={onDecrease}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <output aria-live="polite">{quantity}</output>
      <button
        type="button"
        title={locale === "nl" ? "Eén meer" : "Increase"}
        aria-label={locale === "nl" ? `Meer ${label}` : `Increase ${label}`}
        disabled={!canIncrease}
        onClick={onIncrease}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * De naam van een regel zoals ook de bestelling ze draagt (`ticketLineName` in
 * lib/ticketing/orders.ts): bij een soort met ledenprijs staat erbij welke prijs.
 */
function lineLabel(line: TicketLine, locale: "nl" | "en"): string {
  if (line.type.memberPriceCents == null) return line.type.name;
  if (line.memberPrice) return `${line.type.name} (${locale === "nl" ? "lid" : "member"})`;
  return `${line.type.name} (${locale === "nl" ? "niet-lid" : "non-member"})`;
}

export function TicketShop({
  event,
  locale,
  paymentChoice,
  preview = false,
  about,
}: {
  paymentChoice: PaymentMethodChoice;
  event: SerializedTicketEvent;
  locale: "nl" | "en";
  /**
   * Voorbeeldmodus voor wie het event beheert: de verkoopvensters worden
   * genegeerd, zodat je aantallen kan kiezen en de vragen aan de deelnemers te
   * zien krijgt, maar afrekenen kan niet. Dat laatste is geen vertrouwen op deze
   * vlag alleen: `lib/ticketing/orders` weigert elk event dat niet PUBLISHED is.
   */
  preview?: boolean;
  /**
   * De beschrijving, de poster en het praktische, in de linkerkolom onder de
   * gegevens. Van de server, want daar hoeft de shop niets van te weten.
   */
  about?: ReactNode;
}) {
  const router = useRouter();
  const base = locale === "nl" ? "" : "/en";
  const loginHref = `${base}/inloggen?next=${encodeURIComponent(`${base}/tickets/${event.slug}`)}`;
  const membershipHref = `${base}/lidmaatschap`;
  const detailsRef = useRef<HTMLElement>(null);
  // Per regel (type × prijs), niet per type: zie `TicketLine`.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [buyerName, setBuyerName] = useState(event.viewer?.name ?? "");
  const [buyerEmail, setBuyerEmail] = useState(event.viewer?.email ?? "");
  const [sameBuyer, setSameBuyer] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingProvider, setSubmittingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Telt op bij elke klik op "Verder": ook wanneer de gegevens al openstaan, moet
  // die klik je er terug naartoe brengen.
  const [detailsRequest, setDetailsRequest] = useState(0);

  useEffect(() => {
    if (detailsRequest === 0) return;
    const section = detailsRef.current;
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [detailsRequest]);

  const activeTypes = useMemo(
    () => event.ticketTypes.filter((type) => type.active),
    [event.ticketTypes],
  );
  const lines = useMemo(() => activeTypes.flatMap(ticketLinesForType), [activeTypes]);
  const selectedCount = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  );
  const totalCents = useMemo(
    () => lines.reduce((sum, line) => sum + (quantities[line.key] ?? 0) * line.priceCents, 0),
    [lines, quantities],
  );
  const selectedLines = lines.filter((line) => (quantities[line.key] ?? 0) > 0);
  const detailsOpen = showDetails && selectedCount > 0;

  const now = new Date(event.currentTime).getTime();
  const beforeSales = event.salesStart ? new Date(event.salesStart).getTime() > now : false;
  const afterSales = event.salesEnd ? new Date(event.salesEnd).getTime() <= now : false;
  const salesOpen = preview || (event.status === "PUBLISHED" && !beforeSales && !afterSales);

  function setQuantity(line: TicketLine, direction: "decrease" | "increase") {
    const current = quantities[line.key] ?? 0;
    const maximum = maximumSelectableForLine({
      line,
      lines,
      quantities,
      maxTicketsPerOrder: event.maxTicketsPerOrder,
    });
    // Het minimum per bestelling geldt voor het type, over beide prijzen samen:
    // heeft de andere regel het al gehaald, dan mag deze per één beginnen.
    const onOtherLines = quantitiesByTicketType(lines, quantities)[line.type.id] - current;
    const minimum = Math.max(1, (line.type.minPerOrder ?? 1) - onOtherLines);
    const next = nextTicketQuantity({ current, direction, minimum, maximum });

    setQuantities((values) => ({ ...values, [line.key]: next }));
    setAttendees((values) => ({
      ...values,
      [line.key]: attendeesForQuantity(values, line.key, next, event.viewer),
    }));
    setError(null);
  }

  function updateAttendee(lineKey: string, index: number, update: Partial<Attendee>) {
    setAttendees((values) => ({
      ...values,
      [lineKey]: (values[lineKey] ?? []).map((attendee, attendeeIndex) =>
        attendeeIndex === index ? { ...attendee, ...update } : attendee,
      ),
    }));
  }

  function openDetails() {
    setShowDetails(true);
    setDetailsRequest((request) => request + 1);
  }

  async function submitCheckout(event_: FormEvent<HTMLFormElement>) {
    event_.preventDefault();
    if (preview) return;
    if (selectedCount < 1 || submitting) {
      setError(locale === "nl" ? "Kies minstens één ticket." : "Choose at least one ticket.");
      return;
    }

    const submitter = (event_.nativeEvent as SubmitEvent).submitter;
    const provider = submitter instanceof HTMLButtonElement && submitter.value
      ? submitter.value
      : paymentChoice.options[0]?.provider;
    setSubmitting(true);
    setSubmittingProvider(provider ?? null);
    setError(null);
    // Hoeveel mensen die een evenement openen ook effectief beginnen af te
    // rekenen. Zonder bestelnummer: dat hoort bij een persoon, en de
    // bestelpagina's worden juist daarom niet gemeten.
    trackCheckoutStart({ slug: event.slug, title: event.title });

    const items = lines.flatMap((line) =>
      (attendees[line.key] ?? []).map((attendee) => ({
        ticketTypeId: line.type.id,
        memberPrice: line.memberPrice,
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
          paymentProvider: provider,
          buyerName: sameBuyer ? items[0].attendeeName : buyerName.trim(),
          buyerEmail: sameBuyer ? items[0].attendeeEmail : buyerEmail.trim(),
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
      setSubmittingProvider(null);
    }
  }

  /** De prijs en de teller van één regel, met wat haar eventueel tegenhoudt. */
  function renderLineControl(line: TicketLine) {
    const { type } = line;
    const quantity = quantities[line.key] ?? 0;
    const soldOut = type.available < 1;
    const typeBeforeSales = type.salesStart ? new Date(type.salesStart).getTime() > now : false;
    const typeAfterSales = type.salesEnd ? new Date(type.salesEnd).getTime() <= now : false;
    const typeSalesOpen = preview || (salesOpen && !typeBeforeSales && !typeAfterSales);
    const maximum = maximumSelectableForLine({
      line,
      lines,
      quantities,
      maxTicketsPerOrder: event.maxTicketsPerOrder,
    });
    const onOtherLines = quantitiesByTicketType(lines, quantities)[type.id] - quantity;
    const belowMinimum = maximum < Math.max(1, (type.minPerOrder ?? 1) - onOtherLines);
    const unavailable = soldOut || !typeSalesOpen;

    return (
      <>
        <span className="tshop-price" data-unavailable={unavailable || undefined}>
          {formatTicketPrice(line.priceCents, event.currency, locale)}
        </span>
        {soldOut ? (
          <span className="tshop-pill" data-tone="out">{locale === "nl" ? "Uitverkocht" : "Sold out"}</span>
        ) : typeSalesOpen ? (
          <TicketStepper
            label={lineLabel(line, locale)}
            quantity={quantity}
            canDecrease={quantity > 0}
            canIncrease={!belowMinimum && quantity < maximum && selectedCount < event.maxTicketsPerOrder}
            onDecrease={() => setQuantity(line, "decrease")}
            onIncrease={() => setQuantity(line, "increase")}
            locale={locale}
          />
        ) : null}
      </>
    );
  }

  /** Wat er onder de naam van een type staat: beschrijving en beschikbaarheid. */
  function renderTypeNotes(type: SerializedTicketEvent["ticketTypes"][number]) {
    const typeBeforeSales = type.salesStart ? new Date(type.salesStart).getTime() > now : false;
    const typeAfterSales = type.salesEnd ? new Date(type.salesEnd).getTime() <= now : false;
    // Is de verkoop van het hele event nog dicht, dan zegt de melding bovenaan
    // dat al één keer; hier enkel wat voor dit type anders is.
    const note = !salesOpen || type.available < 1
      ? null
      : typeBeforeSales && !preview
        ? locale === "nl"
          ? `Verkoop start op ${formatTicketDate(type.salesStart!, locale)}`
          : `Sales start on ${formatTicketDate(type.salesStart!, locale)}`
        : typeAfterSales && !preview
          ? locale === "nl" ? "Verkoop gesloten" : "Sales closed"
          : null;
    const low = type.available > 0 && type.available <= LOW_STOCK;

    if (!type.description && !note && !low) return null;
    return (
      <p className="tshop-type-note">
        {type.description ? <span>{type.description}</span> : null}
        {note ? <span>{note}</span> : null}
        {low ? (
          <span className="tshop-pill" data-tone="low">
            {locale === "nl" ? `Nog ${type.available}` : `${type.available} left`}
          </span>
        ) : null}
      </p>
    );
  }

  const checkoutDisabledLabel = !salesOpen
    ? beforeSales
      ? locale === "nl" ? "Nog niet te koop" : "Not on sale yet"
      : locale === "nl" ? "Verkoop gesloten" : "Sales closed"
    : locale === "nl" ? "Kies eerst een ticket" : "Select tickets first";

  return (
    <form className="tshop" onSubmit={submitCheckout}>
      <div className="tshop-main">
        {detailsOpen ? (
          <section className="tshop-details" ref={detailsRef} aria-labelledby="ticket-details-heading">
            <h2 id="ticket-details-heading" className="tshop-heading">
              {locale === "nl" ? "Jouw gegevens" : "Your details"}
            </h2>
            <p className="tshop-lede">
              {locale === "nl" ? "Elk ticket wordt op naam gezet." : "Each ticket is issued to one attendee."}
            </p>

            <div className="ticket-attendee-list">
              {lines.flatMap((line) =>
                (attendees[line.key] ?? []).map((attendee, index) => (
                  <fieldset className="ticket-attendee" key={`${line.key}-${index}`}>
                    <legend>
                      <Ticket size={16} aria-hidden="true" />
                      {lineLabel(line, locale)} · {index + 1}
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
                            onChange={(event_) => updateAttendee(line.key, index, { attendeeName: event_.target.value })}
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
                            onChange={(event_) => updateAttendee(line.key, index, { attendeeEmail: event_.target.value })}
                          />
                        </div>
                      </label>
                      {(line.type.questions ?? []).map((question) => (
                        <QuestionField
                          key={question.id}
                          question={question}
                          fieldPrefix={`${line.key}-${index}`}
                          value={attendee.answers[question.id]}
                          locale={locale}
                          onChange={(value) =>
                            updateAttendee(line.key, index, {
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

            <label className="ticket-checkbox ticket-same-buyer">
              <input type="checkbox" checked={sameBuyer} onChange={(event_) => setSameBuyer(event_.target.checked)} />
              <span>{locale === "nl" ? "Stuur de bestelling naar de eerste aanwezige" : "Send the order to the first attendee"}</span>
            </label>

            {!sameBuyer ? (
              <fieldset className="ticket-attendee">
                <legend>{locale === "nl" ? "Gegevens koper" : "Buyer details"}</legend>
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
              </fieldset>
            ) : null}

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

            {error ? <div className="ticket-error" role="alert"><AlertCircle size={17} aria-hidden="true" /> {error}</div> : null}

            <div className="tshop-pay">
              {totalCents > 0 ? (
                <PaymentMethodChooser
                  locale={locale}
                  choice={paymentChoice}
                  checkout={{
                    busy: submitting,
                    busyProvider: submittingProvider,
                    disabled: preview || !salesOpen,
                  }}
                />
              ) : (
                <button className="tshop-cta" type="submit" disabled={preview || !salesOpen || submitting}>
                  {submitting ? <LoaderCircle className="is-spinning" size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                  <span>{submitting
                    ? locale === "nl" ? "Bestelling verwerken…" : "Processing order…"
                    : locale === "nl" ? "Gratis tickets bevestigen" : "Confirm free tickets"}</span>
                </button>
              )}
              {preview ? (
                <p className="tshop-muted">
                  {locale === "nl" ? "Voorbeeld: bestellen is uitgeschakeld." : "Preview: ordering is disabled."}
                </p>
              ) : null}
            </div>

            <p className="ticket-privacy-note">
              {locale === "nl"
                ? "VTK gebruikt deze gegevens om je bestelling uit te voeren, tickets te leveren, fraude te voorkomen en de boekhouding bij te houden. "
                : "VTK uses these details to fulfil your order, deliver tickets, prevent fraud and maintain accounting records. "}
              <a href={`${base}/privacy`} className="font-medium text-vtk-ink underline">
                {locale === "nl" ? "Lees de privacyverklaring." : "Read the privacy statement."}
              </a>
            </p>
          </section>
        ) : null}

        {about}
      </div>

      <aside className="tshop-panel" aria-labelledby="ticket-types-heading">
        <div className="tshop-panel-head">
          <h2 id="ticket-types-heading">Tickets</h2>
          {lines.length > 0 ? (
            <small>
              {locale === "nl"
                ? `Max. ${event.maxTicketsPerOrder} per bestelling`
                : `Max. ${event.maxTicketsPerOrder} per order`}
            </small>
          ) : null}
        </div>

        {/* Enkel voor wie nu in voorverkoop koopt. Wie er niet in mag, krijgt
            hier niets te zien: dan is het gewoon een verkoop die later start. */}
        {event.presale ? (
          <p className="tshop-notice" data-tone="presale">
            <Sparkles size={18} aria-hidden="true" />
            <span>
              <strong>{locale === "nl" ? "Jij zit in de voorverkoop." : "You are in the presale."}</strong>{" "}
              {locale === "nl"
                ? `Voor iedereen opent de verkoop ${formatTicketDate(event.presale.publicStart, locale)}.`
                : `Sales open for everyone on ${formatTicketDate(event.presale.publicStart, locale)}.`}
            </span>
          </p>
        ) : null}

        {/* In voorbeeldmodus staat de verkoop open zodat de beheerder door de
            vragen kan klikken; wat een bezoeker nu te zien zou krijgen, staat
            er dan als mededeling bij in plaats van als blokkade. */}
        {!salesOpen || (preview && (beforeSales || afterSales)) ? (
          <p className="tshop-notice">
            <Clock size={18} aria-hidden="true" />
            <span>
              {preview ? (locale === "nl" ? "Bezoekers zien nu: " : "Visitors currently see: ") : null}
              <strong>
                {beforeSales
                  ? locale === "nl"
                    ? `De verkoop start ${formatTicketDate(event.salesStart!, locale)}.`
                    : `Sales start on ${formatTicketDate(event.salesStart!, locale)}.`
                  : locale === "nl"
                    ? "De ticketverkoop is gesloten."
                    : "Ticket sales are closed."}
              </strong>
              {beforeSales && !preview
                ? locale === "nl" ? " De prijzen staan hieronder al." : " Prices are listed below."
                : null}
            </span>
          </p>
        ) : null}

        {lines.length === 0 ? (
          <div className="tshop-empty">
            <TicketX size={26} aria-hidden="true" />
            <h3>
              {event.requiresLogin
                ? locale === "nl" ? "Log in om tickets te bestellen" : "Sign in to order tickets"
                : event.requiresMembership
                  ? locale === "nl" ? "Alleen voor leden" : "Members only"
                  : locale === "nl" ? "Geen tickets beschikbaar" : "No tickets available"}
            </h3>
            <p>
              {event.requiresLogin
                ? locale === "nl"
                  ? "Voor de beschikbare tickets moet je ingelogd zijn."
                  : "You need to sign in for the available tickets."
                : event.requiresMembership
                  ? locale === "nl"
                    ? "De tickets voor dit event zijn er voor leden van VTK."
                    : "The tickets for this event are for members of VTK."
                  : locale === "nl"
                    ? "Er zijn momenteel geen tickettypes beschikbaar voor dit event."
                    : "There are currently no ticket types available for this event."}
            </p>
            {event.requiresLogin ? (
              <Link className="tshop-cta" href={loginHref}>
                <LogIn size={17} aria-hidden="true" />
                {locale === "nl" ? "Inloggen" : "Sign in"}
              </Link>
            ) : event.requiresMembership ? (
              <Link className="tshop-cta" href={membershipHref}>
                {locale === "nl" ? "Word lid" : "Become a member"}
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="tshop-types">
              {activeTypes.map((type) => {
                const typeLines = ticketLinesForType(type);
                const split = typeLines.length > 1;
                return (
                  <li key={type.id} className="tshop-type" data-split={split || undefined}>
                    {split ? (
                      <>
                        <h3>{type.name}</h3>
                        {renderTypeNotes(type)}
                        {typeLines.map((line) => (
                          <div className="tshop-line" key={line.key}>
                            <span className="tshop-audience">
                              {line.memberPrice
                                ? locale === "nl" ? "Lid" : "Member"
                                : locale === "nl" ? "Niet-lid" : "Non-member"}
                            </span>
                            {renderLineControl(line)}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="tshop-line">
                        <div className="tshop-line-name">
                          <h3>{type.name}</h3>
                          {renderTypeNotes(type)}
                        </div>
                        {renderLineControl(typeLines[0])}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {event.memberPriceHint ? (
              <p className="tshop-hint">
                {event.memberPriceHint === "login" ? (
                  <>
                    {locale === "nl" ? "Lid van VTK? " : "VTK member? "}
                    <Link href={loginHref}>
                      {locale === "nl" ? "Log in voor de ledenprijs." : "Sign in for the member price."}
                    </Link>
                  </>
                ) : (
                  <>
                    {locale === "nl" ? "Leden betalen minder. " : "Members pay less. "}
                    <Link href={membershipHref}>{locale === "nl" ? "Word lid." : "Become a member."}</Link>
                  </>
                )}
              </p>
            ) : null}

            <div className="tshop-summary">
              {selectedLines.length > 0 ? (
                <ul className="tshop-summary-lines">
                  {selectedLines.map((line) => (
                    <li key={line.key}>
                      <span>{quantities[line.key]} × {lineLabel(line, locale)}</span>
                      <span>{formatTicketPrice(quantities[line.key] * line.priceCents, event.currency, locale)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="tshop-total">
                <span>{locale === "nl" ? "Totaal" : "Total"}</span>
                <strong>{formatTicketPrice(totalCents, event.currency, locale)}</strong>
              </div>
              <button
                className="tshop-cta"
                type="button"
                disabled={!salesOpen || selectedCount === 0}
                onClick={openDetails}
              >
                {selectedCount === 0 || !salesOpen ? (
                  <>
                    <LockKeyhole size={17} aria-hidden="true" />
                    <span>{checkoutDisabledLabel}</span>
                  </>
                ) : (
                  <>
                    <span>{locale === "nl" ? "Verder naar gegevens" : "Continue to details"}</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </>
                )}
              </button>
              <div className="tshop-trust">
                <span><ShieldCheck size={14} aria-hidden="true" /> {locale === "nl" ? "Beveiligde betaling" : "Secure payment"}</span>
                <span><Check size={14} aria-hidden="true" /> {locale === "nl" ? "Ticket per e-mail" : "Ticket by email"}</span>
              </div>
            </div>
          </>
        )}
      </aside>
    </form>
  );
}
