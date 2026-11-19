"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "@/components/ui/Link";
import { PaymentMethodChooser, type PaymentMethodChoice, type PaymentMethodOption } from "./PaymentMethodChooser";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
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
  formatTicketMoment,
  formatTicketPrice,
  maximumSelectableForLine,
  nextTicketQuantity,
  orderLimit,
  quantitiesByTicketType,
  ticketLineRemaining,
  ticketLineSalesStart,
  ticketLinesForType,
  ticketLineWaitsForMembers,
  ticketTypeRemaining,
  type SerializedTicketEvent,
  type TicketLine,
  type TicketQuestion,
} from "./types";
import { trackCheckoutStart } from "@/lib/analytics-client";
import { audienceLoginHintQuestion } from "@/lib/ticketing/audience";
import { sourceQuery } from "@/lib/ticketing/source";
import { useLandingSource } from "./useLandingSource";

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
  /** Bij SOLD_OUT: `MEMBER_SEATS` of `NON_MEMBER_SEATS`, bij INVALID_ANSWER: `question.code`. */
  field?: string;
  /** Bij INVALID_REQUEST (ZodError): veldnamen en foutmeldingen. */
  fields?: Record<string, string[] | undefined>;
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

/**
 * Behoudt eerder ingevulde deelnemers in state wanneer het aantal daalt,
 * zodat een stap terug omhoog niets wist. Het weergeven en insturen gebruiken
 * `.slice(0, quantity)`.
 */
export function retainAttendeesForQuantity(
  values: Record<string, Attendee[]>,
  ticketTypeId: string,
  quantity: number,
  viewer?: { name: string; email: string } | null,
  quantities?: Record<string, number>,
): Attendee[] {
  const currentAttendees = values[ticketTypeId] ?? [];
  if (quantity <= currentAttendees.length) {
    return currentAttendees;
  }
  const hasActiveAttendees = Object.entries(values).some(([key, list]) => {
    const activeCount = quantities ? Math.min(list.length, quantities[key] ?? 0) : list.length;
    return activeCount > 0;
  });
  let prefillBuyer = Boolean(viewer) && !hasActiveAttendees;
  const extra = Array.from({ length: quantity - currentAttendees.length }, () => {
    if (prefillBuyer) {
      prefillBuyer = false;
      return emptyAttendee(viewer);
    }
    return emptyAttendee();
  });
  return [...currentAttendees, ...extra];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return value.length <= 320 && EMAIL_PATTERN.test(value);
}

const PAYMENT_PROVIDER_LABELS: Record<
  PaymentMethodOption["provider"],
  { nl: string; en: string }
> = {
  bancontact: { nl: "Bancontact", en: "Bancontact" },
  mollie: { nl: "Mollie", en: "Mollie" },
  mock: { nl: "Testbetaling", en: "Test payment" },
};

function formatAnswerForReview(
  question: TicketQuestion,
  value: string | string[] | boolean | undefined,
  locale: "nl" | "en",
): string | null {
  if (value === undefined || value === "") return null;
  const type = question.type ?? "TEXT";
  const optionMap = new Map(
    (question.options ?? []).map((option) =>
      typeof option === "string"
        ? [option, option]
        : [option.value, option.label ?? option.value],
    ),
  );
  if (type === "BOOLEAN" || type === "CHECKBOX") {
    if (typeof value !== "boolean") return null;
    if (type === "CHECKBOX" && !value) return null;
    return value ? (locale === "nl" ? "Ja" : "Yes") : locale === "nl" ? "Nee" : "No";
  }
  if (type === "MULTIPLE_CHOICE") {
    if (!Array.isArray(value) || value.length === 0) return null;
    return value.map((item) => optionMap.get(item) ?? item).join(", ");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (type === "SELECT" || type === "SINGLE_CHOICE") {
      return optionMap.get(trimmed) ?? trimmed;
    }
    return trimmed;
  }
  return null;
}

function checkoutErrorMessage(
  code: string | undefined,
  locale: "nl" | "en",
  field?: string,
): string {
  // Het event zit niet vol, enkel de plaatsen voor leden of voor niet-leden.
  if (code === "SOLD_OUT" && field === "MEMBER_SEATS") {
    return locale === "nl"
      ? "De plaatsen voor leden zijn net op. Er zijn enkel nog tickets voor niet-leden."
      : "The places for members have just run out. Only tickets for non-members are left.";
  }
  if (code === "SOLD_OUT" && field === "NON_MEMBER_SEATS") {
    return locale === "nl"
      ? "De plaatsen voor niet-leden zijn net op. Er zijn enkel nog tickets voor leden."
      : "The places for non-members have just run out. Only tickets for members are left.";
  }
  const messages: Record<string, { nl: string; en: string }> = {
    EVENT_NOT_ON_SALE: { nl: "De ticketverkoop is niet geopend.", en: "Ticket sales are not open." },
    INVALID_TICKET_TYPE: { nl: "Een gekozen tickettype is niet meer beschikbaar.", en: "A selected ticket type is no longer available." },
    LOGIN_REQUIRED: { nl: "Log in om deze bestelling af te ronden.", en: "Sign in to complete this order." },
    MEMBERSHIP_REQUIRED: { nl: "Dit ticket is er voor leden van VTK.", en: "This ticket is for members of VTK." },
    INVALID_REQUEST: { nl: "Controleer de ingevulde gegevens.", en: "Check the entered details." },
    INVALID_QUANTITY: { nl: "Controleer het gekozen aantal tickets.", en: "Check the selected ticket quantity." },
    INVALID_ANSWER: { nl: "Controleer de antwoorden bij de aanwezigen.", en: "Check the attendee answers." },
    TOO_MANY_RESERVATIONS: { nl: "Er staan al meerdere reservaties open. Probeer later opnieuw.", en: "Several reservations are already pending. Try again later." },
    FREE_TICKET_LIMIT: { nl: "Je hebt het maximum aantal gratis tickets voor dit event bereikt.", en: "You have reached the free-ticket limit for this event." },
    SOLD_OUT: { nl: "Deze tickets zijn net uitverkocht.", en: "These tickets have just sold out." },
    HONORARY_PRICE_USED: { nl: "Je erelidticket voor dit event heb je al. Kies de gewone prijs.", en: "You already have your honorary ticket for this event. Choose the regular price." },
    HONORARY_TICKET_LIMIT: { nl: "Als erelid koop je voor dit event één ticket, en dat heb je al.", en: "As an honorary member you can buy one ticket for this event, and you already have it." },
    PAYMENT_UNAVAILABLE: { nl: "De betaalpagina is tijdelijk niet bereikbaar. Probeer straks opnieuw.", en: "The payment page is temporarily unavailable. Try again shortly." },
    REQUEST_BODY_TOO_LARGE: { nl: "De bestelling bevat te veel gegevens.", en: "The order contains too much data." },
    BUSY: { nl: "Het is heel druk. Je bestelling is niet doorgegaan; probeer meteen opnieuw.", en: "It is very busy. Your order did not go through; try again straight away." },
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
  error,
  isFirstAttendee,
}: {
  question: TicketQuestion;
  fieldPrefix: string;
  value: string | string[] | boolean | undefined;
  onChange: (value: string | string[] | boolean) => void;
  locale: "nl" | "en";
  error?: string;
  isFirstAttendee: boolean;
}) {
  const fieldId = `${fieldPrefix}-question-${question.id}`;
  const descriptionId = question.description ? `${fieldId}-description` : undefined;
  const errorId = `${fieldId}-error`;
  const describedBy = [descriptionId, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  const type = question.type ?? "TEXT";

  const options = (question.options ?? []).map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : { value: option.value, label: option.label ?? option.value },
  );

  if (type === "BOOLEAN") {
    return (
      <fieldset
        className="ticket-choice-field"
        aria-required={question.required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        <legend>{question.label}{question.required ? " *" : ""}</legend>
        <div className="ticket-choice-list ticket-boolean-options">
          <label htmlFor={`${fieldId}-yes`}>
            <input
              id={`${fieldId}-yes`}
              name={fieldId}
              type="radio"
              checked={value === true}
              required={question.required}
              aria-describedby={describedBy}
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
              aria-describedby={describedBy}
              onChange={() => onChange(false)}
            />
            {locale === "nl" ? "Nee" : "No"}
          </label>
        </div>
        {question.description ? <small id={descriptionId}>{question.description}</small> : null}
        {error ? <small id={errorId} className="ticket-field-error">{error}</small> : null}
      </fieldset>
    );
  }

  if (type === "CHECKBOX") {
    return (
      <div className="ticket-checkbox-wrap">
        <label className="ticket-checkbox" htmlFor={fieldId}>
          <input
            id={fieldId}
            type="checkbox"
            checked={value === true}
            required={question.required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>
            <strong>
              {question.label}
              {question.required ? " *" : ""}
            </strong>
            {question.description ? <small id={descriptionId}>{question.description}</small> : null}
          </span>
        </label>
        {error ? <small id={errorId} className="ticket-field-error">{error}</small> : null}
      </div>
    );
  }

  if (type === "MULTIPLE_CHOICE") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset
        className="ticket-choice-field"
        aria-required={question.required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        <legend>{question.label}{question.required ? " *" : ""}</legend>
        <div className="ticket-choice-list">
          {options.map((option, index) => (
            <label key={option.value} htmlFor={`${fieldId}-${index}`}>
              <input
                id={`${fieldId}-${index}`}
                type="checkbox"
                checked={selected.includes(option.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
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
        {error ? <small id={errorId} className="ticket-field-error">{error}</small> : null}
      </fieldset>
    );
  }

  return (
    <div className="ticket-field">
      <label htmlFor={fieldId}>
        {question.label}
        {question.required ? " *" : ""}
      </label>
      {type === "SELECT" || type === "SINGLE_CHOICE" ? (
        <select
          id={fieldId}
          required={question.required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
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
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={fieldId}
          type={type === "EMAIL" ? "email" : "text"}
          autoComplete={type === "EMAIL" ? (isFirstAttendee ? "email" : "off") : undefined}
          required={question.required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {question.description ? <small id={descriptionId}>{question.description}</small> : null}
      {error ? <small id={errorId} className="ticket-field-error">{error}</small> : null}
    </div>
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
        aria-disabled={!canDecrease}
        onClick={() => {
          if (canDecrease) onDecrease();
        }}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <output aria-live="polite">{quantity}</output>
      <button
        type="button"
        title={locale === "nl" ? "Eén meer" : "Increase"}
        aria-label={locale === "nl" ? `Meer ${label}` : `Increase ${label}`}
        aria-disabled={!canIncrease}
        onClick={() => {
          if (canIncrease) onIncrease();
        }}
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
  if (line.honorary) return `${line.type.name} (${locale === "nl" ? "erelid" : "honorary member"})`;
  if (line.type.memberPriceCents == null) return line.type.name;
  if (line.memberPrice) return `${line.type.name} (${locale === "nl" ? "lid" : "member"})`;
  return `${line.type.name} (${locale === "nl" ? "niet-lid" : "non-member"})`;
}

/** Wie een regel bedoeld is, naast de prijs, wanneer een type meer dan één regel heeft. */
function lineAudience(line: TicketLine, locale: "nl" | "en"): string {
  const nl = locale === "nl";
  if (line.honorary) {
    if (line.priceCents === 0) return nl ? "Erelid, 1 gratis" : "Honorary, 1 free";
    return nl ? "Erelid, max. 1" : "Honorary, max. 1";
  }
  if (line.memberPrice) return nl ? "Lid" : "Member";
  // Zonder ledenprijs is de gewone prijs voor iedereen, niet enkel voor niet-leden.
  if (line.type.memberPriceCents == null) return nl ? "Gewone prijs" : "Regular price";
  return nl ? "Niet-lid" : "Non-member";
}

export function TicketShop({
  event,
  locale,
  paymentChoice,
  preview = false,
  about,
  practical,
  choices,
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
  /**
   * Het praktische (wanneer, waar, wie), onder het ticketpaneel in de
   * rechterkolom. Naast de beschrijving kneep het die tot een smalle kolom.
   *
   * Staat buiten elk formulier: op de eventpagina zitten hier de interesseknop
   * en zijn gegevens, en dat zijn eigen formulieren.
   */
  practical?: ReactNode;
  /**
   * Bovenaan het paneel, onder "Tickets": de keuze tussen de verkopen van één
   * event (tabs die elk naar hun eigen adres gaan). Zie lib/ticketing/eventPage.ts.
   */
  choices?: ReactNode;
}) {
  const router = useRouter();
  const base = locale === "nl" ? "" : "/en";
  // Langs waar deze koper kwam; gaat mee met de bestelling en met de
  // login-link, anders komt wie eerst moet inloggen terug als "direct".
  const landingSource = useLandingSource();
  const loginHref = `${base}/inloggen?next=${encodeURIComponent(`${base}/tickets/${event.slug}${sourceQuery(landingSource)}`)}`;
  const membershipHref = `${base}/lidmaatschap`;
  const audienceHint = audienceLoginHintQuestion(event.audienceLoginHint ?? [], locale);
  const detailsRef = useRef<HTMLDivElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  // Per regel (type × prijs), niet per type: zie `TicketLine`.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [buyerName, setBuyerName] = useState(event.viewer?.name ?? "");
  const [buyerEmail, setBuyerEmail] = useState(event.viewer?.email ?? "");
  const [sameBuyer, setSameBuyer] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"details" | "review">("details");
  const [selectedProvider, setSelectedProvider] = useState<PaymentMethodOption["provider"] | undefined>(
    () => paymentChoice.options[0]?.provider,
  );
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const pendingFocusIdRef = useRef<string | null>(null);
  const [errorFocusRequest, setErrorFocusRequest] = useState(0);
  // Telt op bij elke klik op "Verder": ook wanneer de gegevens al openstaan, moet
  // die klik je er terug naartoe brengen.
  const [detailsRequest, setDetailsRequest] = useState(0);
  const [editDetailsRequest, setEditDetailsRequest] = useState(0);

  function scrollIntoViewRespectingMotion(element: HTMLElement) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  useEffect(() => {
    if (detailsRequest === 0) return;
    const section = detailsRef.current;
    if (!section) return;
    scrollIntoViewRespectingMotion(section);
    const firstInput = section.querySelector<HTMLElement>("input, select, textarea");
    if (firstInput) {
      firstInput.focus({ preventScroll: true });
    } else {
      detailsHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [detailsRequest]);

  useEffect(() => {
    if (editDetailsRequest === 0 || checkoutStep !== "details") return;
    const section = detailsRef.current;
    if (section) scrollIntoViewRespectingMotion(section);
    detailsHeadingRef.current?.focus({ preventScroll: true });
  }, [editDetailsRequest, checkoutStep]);

  useEffect(() => {
    if (checkoutStep !== "review") return;
    const section = detailsRef.current;
    if (section) scrollIntoViewRespectingMotion(section);
    reviewHeadingRef.current?.focus({ preventScroll: true });
  }, [checkoutStep]);

  useEffect(() => {
    if (errorFocusRequest === 0 || checkoutStep !== "details") return;
    const targetId = pendingFocusIdRef.current;
    if (!targetId) return;
    pendingFocusIdRef.current = null;
    const target =
      targetId === "paymentProvider"
        ? detailsRef.current?.querySelector<HTMLElement>('.ticket-pay-options input[type="radio"]') ?? null
        : document.getElementById(targetId);
    if (target) {
      scrollIntoViewRespectingMotion(target);
      target.focus({ preventScroll: true });
    }
  }, [errorFocusRequest, checkoutStep]);

  const activeTypes = useMemo(
    () => event.ticketTypes.filter((type) => type.active),
    [event.ticketTypes],
  );
  const lines = useMemo(() => activeTypes.flatMap(ticketLinesForType), [activeTypes]);
  // Een erelid op een event met `honoraryOneTicket` koopt één ticket in totaal,
  // en geen meer wanneer het er al een heeft. Verder het maximum van het event.
  const orderMax = event.honoraryOneTicket
    ? Math.min(event.maxTicketsPerOrder, event.honoraryOneTicket.used ? 0 : 1)
    : event.maxTicketsPerOrder;
  // Wat één bestelling hier echt kan tellen: het maximum van het event, of
  // minder wanneer de tickets elk een lager maximum hebben.
  const limit = orderLimit(activeTypes, orderMax);
  const selectedCount = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  );
  const totalCents = useMemo(
    () => lines.reduce((sum, line) => sum + (quantities[line.key] ?? 0) * line.priceCents, 0),
    [lines, quantities],
  );
  const selectedLines = lines.filter((line) => (quantities[line.key] ?? 0) > 0);
  const activeAttendeeEntries = useMemo(
    () =>
      lines.flatMap((line) => {
        const count = quantities[line.key] ?? 0;
        return (attendees[line.key] ?? []).slice(0, count).map((attendee, index) => ({
          line,
          index,
          attendee,
        }));
      }),
    [attendees, lines, quantities],
  );
  const detailsOpen = showDetails && selectedCount > 0;

  const now = new Date(event.currentTime).getTime();
  const beforeSales = event.salesStart ? new Date(event.salesStart).getTime() > now : false;
  const afterSales = event.salesEnd ? new Date(event.salesEnd).getTime() <= now : false;
  const salesOpen = preview || (event.status === "PUBLISHED" && !beforeSales && !afterSales);
  // Een regel zonder ledenprijs die op de niet-leden wacht, is er een van een
  // bezoeker die geen lid is (of niet ingelogd): bij een lid neemt zo'n regel
  // een ledenplaats en gaat ze met de leden open.
  const viewerWaitsForMembers =
    !preview &&
    salesOpen &&
    lines.some((line) => line.type.memberPriceCents == null && ticketLineWaitsForMembers(line, now));

  function clearFieldError(key: string) {
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function setQuantity(line: TicketLine, direction: "decrease" | "increase") {
    const current = quantities[line.key] ?? 0;
    const maximum = maximumSelectableForLine({
      line,
      lines,
      quantities,
      maxTicketsPerOrder: orderMax,
    });
    // Het minimum per bestelling geldt voor het type, over beide prijzen samen:
    // heeft de andere regel het al gehaald, dan mag deze per één beginnen.
    const onOtherLines = quantitiesByTicketType(lines, quantities)[line.type.id] - current;
    const minimum = Math.max(1, (line.type.minPerOrder ?? 1) - onOtherLines);
    const next = nextTicketQuantity({ current, direction, minimum, maximum });

    setQuantities((values) => ({ ...values, [line.key]: next }));
    setAttendees((values) => ({
      ...values,
      [line.key]: retainAttendeesForQuantity(values, line.key, next, event.viewer, quantities),
    }));
    setCheckoutStep("details");
    setFieldErrors({});
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
    setCheckoutStep("details");
    setDetailsRequest((request) => request + 1);
  }

  function focusTargetIdForError(errorKey: string): string {
    if (errorKey === "buyer-name") return "ticket-buyer-name";
    if (errorKey === "buyer-email") return "ticket-buyer-email";
    if (errorKey === "terms") return "ticket-terms-accepted";
    if (errorKey === "paymentProvider") return "paymentProvider";
    const questionMatch = errorKey.match(/^(.*)-question-([^/]+)$/);
    if (questionMatch) {
      const [, prefix, qId] = questionMatch;
      const matchingQuestion = activeAttendeeEntries
        .find((entry) => `${entry.line.key}-${entry.index}` === prefix)
        ?.line.type.questions?.find((question) => question.id === qId);
      if (matchingQuestion?.type === "BOOLEAN") return `${errorKey}-yes`;
      if (matchingQuestion?.type === "MULTIPLE_CHOICE") return `${errorKey}-0`;
    }
    return errorKey;
  }

  function validateDetails(): { errors: Record<string, string>; firstKey: string | null } {
    const nl = locale === "nl";
    const errors: Record<string, string> = {};
    let firstKey: string | null = null;
    const addError = (key: string, message: string) => {
      if (!(key in errors)) {
        errors[key] = message;
        if (!firstKey) firstKey = key;
      }
    };

    for (const { line, index, attendee } of activeAttendeeEntries) {
      const prefix = `${line.key}-${index}`;
      const trimmedName = attendee.attendeeName.trim();
      const trimmedEmail = attendee.attendeeEmail.trim();
      if (trimmedName.length === 0) {
        addError(
          `${prefix}-name`,
          nl ? "Vul de naam van de aanwezige in." : "Enter the attendee's name.",
        );
      } else if (trimmedName.length < 2) {
        addError(
          `${prefix}-name`,
          nl ? "Vul minstens 2 tekens in." : "Enter at least 2 characters.",
        );
      }

      if (trimmedEmail.length === 0) {
        addError(
          `${prefix}-email`,
          nl ? "Vul het e-mailadres van de aanwezige in." : "Enter the attendee's email address.",
        );
      } else if (!isValidEmail(trimmedEmail)) {
        addError(
          `${prefix}-email`,
          nl ? "Vul een geldig e-mailadres in." : "Enter a valid email address.",
        );
      }

      for (const question of line.type.questions ?? []) {
        const qKey = `${prefix}-question-${question.id}`;
        const value = attendee.answers[question.id];
        const qType = question.type ?? "TEXT";
        if (question.required) {
          if (qType === "BOOLEAN") {
            if (typeof value !== "boolean") {
              addError(qKey, nl ? "Kies ja of nee." : "Select yes or no.");
            }
          } else if (qType === "CHECKBOX") {
            if (value !== true) {
              addError(qKey, nl ? "Vink dit vakje aan." : "Check this box.");
            }
          } else if (qType === "MULTIPLE_CHOICE") {
            if (!Array.isArray(value) || value.length === 0) {
              addError(qKey, nl ? "Kies minstens één optie." : "Select at least one option.");
            }
          } else if (qType === "SELECT" || qType === "SINGLE_CHOICE") {
            if (typeof value !== "string" || value.trim().length === 0) {
              addError(qKey, nl ? "Maak een keuze." : "Make a selection.");
            }
          } else if (typeof value !== "string" || value.trim().length === 0) {
            addError(qKey, nl ? "Vul dit veld in." : "Fill in this field.");
          }
        }
        if (
          qType === "EMAIL" &&
          typeof value === "string" &&
          value.trim().length > 0 &&
          !isValidEmail(value.trim())
        ) {
          addError(qKey, nl ? "Vul een geldig e-mailadres in." : "Enter a valid email address.");
        }
      }
    }

    if (!sameBuyer) {
      const trimmedBuyerName = buyerName.trim();
      const trimmedBuyerEmail = buyerEmail.trim();
      if (trimmedBuyerName.length === 0) {
        addError("buyer-name", nl ? "Vul je volledige naam in." : "Enter your full name.");
      } else if (trimmedBuyerName.length < 2) {
        addError("buyer-name", nl ? "Vul minstens 2 tekens in." : "Enter at least 2 characters.");
      }
      if (trimmedBuyerEmail.length === 0) {
        addError("buyer-email", nl ? "Vul je e-mailadres in." : "Enter your email address.");
      } else if (!isValidEmail(trimmedBuyerEmail)) {
        addError("buyer-email", nl ? "Vul een geldig e-mailadres in." : "Enter a valid email address.");
      }
    }

    if (!termsAccepted) {
      addError(
        "terms",
        nl
          ? "Ga akkoord met de verkoop- en terugbetalingsvoorwaarden om verder te gaan."
          : "Agree to the sales and refund terms to continue.",
      );
    }

    if (totalCents > 0 && paymentChoice.options.length > 0 && !selectedProvider) {
      addError(
        "paymentProvider",
        nl ? "Kies een betaalmethode." : "Choose a payment method.",
      );
    }

    return { errors, firstKey };
  }

  function handleDetailsSubmit(event_: FormEvent<HTMLFormElement>) {
    event_.preventDefault();
    if (selectedCount < 1) {
      setError(locale === "nl" ? "Kies minstens één ticket." : "Choose at least one ticket.");
      return;
    }
    const { errors, firstKey } = validateDetails();
    if (firstKey) {
      setFieldErrors(errors);
      setError(
        locale === "nl"
          ? "Controleer de gemarkeerde velden."
          : "Check the highlighted fields.",
      );
      pendingFocusIdRef.current = focusTargetIdForError(firstKey);
      setErrorFocusRequest((request) => request + 1);
      return;
    }
    setFieldErrors({});
    setError(null);
    setCheckoutStep("review");
  }

  function mapServerFieldErrors(payload: CheckoutResponse): {
    errors: Record<string, string>;
    firstKey: string | null;
  } {
    const nl = locale === "nl";
    const mapped: Record<string, string> = {};
    let firstKey: string | null = null;
    const addMapped = (key: string, message: string) => {
      if (!(key in mapped)) {
        mapped[key] = message;
        if (!firstKey) firstKey = key;
      }
    };

    if (payload.error === "INVALID_REQUEST" && payload.fields) {
      if (payload.fields.buyerName?.length) {
        if (!sameBuyer) {
          addMapped("buyer-name", nl ? "Vul een geldige naam in (minstens 2 tekens)." : "Enter a valid name (at least 2 characters).");
        } else if (activeAttendeeEntries[0]) {
          addMapped(
            `${activeAttendeeEntries[0].line.key}-${activeAttendeeEntries[0].index}-name`,
            nl ? "Vul een geldige naam in (minstens 2 tekens)." : "Enter a valid name (at least 2 characters).",
          );
        }
      }
      if (payload.fields.buyerEmail?.length) {
        if (!sameBuyer) {
          addMapped("buyer-email", nl ? "Vul een geldig e-mailadres in." : "Enter a valid email address.");
        } else if (activeAttendeeEntries[0]) {
          addMapped(
            `${activeAttendeeEntries[0].line.key}-${activeAttendeeEntries[0].index}-email`,
            nl ? "Vul een geldig e-mailadres in." : "Enter a valid email address.",
          );
        }
      }
      if (payload.fields.termsAccepted?.length) {
        addMapped(
          "terms",
          nl ? "Ga akkoord met de verkoop- en terugbetalingsvoorwaarden." : "Agree to the sales and refund terms.",
        );
      }
      if (payload.fields.paymentProvider?.length) {
        addMapped(
          "paymentProvider",
          nl ? "Kies een geldige betaalmethode." : "Choose a valid payment method.",
        );
      }
      if (payload.fields.items?.length) {
        const localCheck = validateDetails();
        for (const [k, v] of Object.entries(localCheck.errors)) {
          addMapped(k, v);
        }
      }
    }

    if (payload.error === "INVALID_ANSWER" && payload.field) {
      const targetCode = payload.field;
      const candidates: Array<{ key: string; invalid: boolean }> = [];
      for (const { line, index, attendee } of activeAttendeeEntries) {
        for (const question of line.type.questions ?? []) {
          if (question.code === targetCode || question.id === targetCode) {
            const val = attendee.answers[question.id];
            const empty =
              val == null ||
              val === "" ||
              (Array.isArray(val) && val.length === 0) ||
              (question.type === "CHECKBOX" && val !== true);
            candidates.push({
              key: `${line.key}-${index}-question-${question.id}`,
              invalid: empty,
            });
          }
        }
      }
      const chosen = candidates.find((candidate) => candidate.invalid) ?? candidates[0];
      if (chosen) {
        addMapped(
          chosen.key,
          nl ? "Controleer dit antwoord." : "Check this answer.",
        );
      }
    }

    return { errors: mapped, firstKey };
  }

  async function submitCheckout() {
    if (preview) return;
    if (selectedCount < 1 || submitting) {
      setError(locale === "nl" ? "Kies minstens één ticket." : "Choose at least one ticket.");
      return;
    }
    const { errors: localErrors, firstKey: localFirstKey } = validateDetails();
    if (localFirstKey) {
      setFieldErrors(localErrors);
      setCheckoutStep("details");
      setError(
        locale === "nl"
          ? "Controleer de gemarkeerde velden."
          : "Check the highlighted fields.",
      );
      pendingFocusIdRef.current = focusTargetIdForError(localFirstKey);
      setErrorFocusRequest((request) => request + 1);
      return;
    }

    const provider = totalCents > 0 ? (selectedProvider ?? paymentChoice.options[0]?.provider) : undefined;
    setSubmitting(true);
    setError(null);
    // Hoeveel mensen die een evenement openen ook effectief beginnen af te
    // rekenen. Zonder bestelnummer: dat hoort bij een persoon, en de
    // bestelpagina's worden juist daarom niet gemeten.
    trackCheckoutStart({ slug: event.slug, title: event.title });

    const items = activeAttendeeEntries.map(({ line, attendee }) => ({
      ticketTypeId: line.type.id,
      memberPrice: line.memberPrice,
      honoraryPrice: Boolean(line.honorary),
      attendeeName: attendee.attendeeName.trim(),
      attendeeEmail: attendee.attendeeEmail.trim(),
      answers: attendee.answers,
    }));

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
          termsAccepted,
          items,
          // Een lege string als de pagina nog niet gemount was: dat is
          // "direct", en geen oude pagina zonder meting.
          source: landingSource?.source ?? "",
          sourceCampaign: landingSource?.campaign ?? undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CheckoutResponse;
      if (!response.ok) {
        const mapped = mapServerFieldErrors(payload);
        if (mapped.firstKey) {
          setFieldErrors(mapped.errors);
          setCheckoutStep("details");
          pendingFocusIdRef.current = focusTargetIdForError(mapped.firstKey);
          setErrorFocusRequest((request) => request + 1);
        }
        throw new Error(payload.message ?? checkoutErrorMessage(payload.error, locale, payload.field));
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

  /** De prijs en de teller van één regel, met wat haar eventueel tegenhoudt. */
  function renderLineControl(line: TicketLine) {
    const { type } = line;
    const quantity = quantities[line.key] ?? 0;
    const soldOut = ticketLineRemaining(line) < 1;
    // Per regel: de plaatsen voor niet-leden kunnen later opengaan dan die voor
    // leden (`nonMemberSalesStart`).
    const lineStart = ticketLineSalesStart(line);
    const lineBeforeSales = lineStart ? new Date(lineStart).getTime() > now : false;
    const typeAfterSales = type.salesEnd ? new Date(type.salesEnd).getTime() <= now : false;
    const typeSalesOpen = preview || (salesOpen && !lineBeforeSales && !typeAfterSales);
    const waitsForMembers = !preview && salesOpen && ticketLineWaitsForMembers(line, now);
    const maximum = maximumSelectableForLine({
      line,
      lines,
      quantities,
      maxTicketsPerOrder: orderMax,
    });
    const onOtherLines = quantitiesByTicketType(lines, quantities)[type.id] - quantity;
    const belowMinimum = maximum < Math.max(1, (type.minPerOrder ?? 1) - onOtherLines);
    const unavailable = soldOut || !typeSalesOpen;

    return (
      <>
        <span className="tshop-price" data-unavailable={unavailable || undefined}>
          {line.honorary && line.priceCents === 0
            ? locale === "nl" ? "Gratis" : "Free"
            : formatTicketPrice(line.priceCents, event.currency, locale)}
        </span>
        {soldOut ? (
          <span className="tshop-pill" data-tone="out">{locale === "nl" ? "Uitverkocht" : "Sold out"}</span>
        ) : waitsForMembers ? (
          <span className="tshop-pill" data-tone="soon">
            {locale === "nl" ? "Vanaf" : "From"} {formatTicketMoment(lineStart!, locale)}
          </span>
        ) : typeSalesOpen ? (
          <TicketStepper
            label={lineLabel(line, locale)}
            quantity={quantity}
            canDecrease={quantity > 0}
            canIncrease={!belowMinimum && quantity < maximum && selectedCount < orderMax}
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
    // Enkel in het voorbeeld: daar staat elke regel open, dus ontbreekt de pil
    // "Vanaf ..." die een bezoeker bij de niet-ledenregel ziet, terwijl de
    // organisator net dat moment wil nakijken.
    const time = (value: string | Date | null | undefined) =>
      value ? new Date(value).getTime() : null;
    const waitingLine = preview
      ? ticketLinesForType(type).find(
          (line) => time(ticketLineSalesStart(line)) !== time(type.salesStart),
        )
      : undefined;
    const nonMembersLater = waitingLine
      ? locale === "nl"
        ? `Voor niet-leden start de verkoop op ${formatTicketDate(ticketLineSalesStart(waitingLine)!, locale)}.`
        : `Sales for non-members start on ${formatTicketDate(ticketLineSalesStart(waitingLine)!, locale)}.`
      : null;
    const typeBeforeSales = type.salesStart ? new Date(type.salesStart).getTime() > now : false;
    const typeAfterSales = type.salesEnd ? new Date(type.salesEnd).getTime() <= now : false;
    // Is de verkoop van het hele event nog dicht, dan zegt de melding bovenaan
    // dat al één keer; hier enkel wat voor dit type anders is.
    const remaining = ticketTypeRemaining(type);
    const note = !salesOpen || remaining < 1
      ? null
      : typeBeforeSales && !preview
        ? locale === "nl"
          ? `Verkoop start op ${formatTicketDate(type.salesStart!, locale)}`
          : `Sales start on ${formatTicketDate(type.salesStart!, locale)}`
        : typeAfterSales && !preview
          ? locale === "nl" ? "Verkoop gesloten" : "Sales closed"
          : null;
    const low = remaining > 0 && remaining <= LOW_STOCK;
    // Enkel wanneer dit ticket strenger is dan de kop: die zegt al hoeveel er
    // samen in één bestelling passen.
    const typeLimit = type.maxPerOrder ?? event.maxTicketsPerOrder;
    const maximum = typeLimit < limit
      ? locale === "nl"
        ? `Max. ${typeLimit} per bestelling`
        : `Max. ${typeLimit} per order`
      : null;
    // Uitverkocht voor deze bezoeker, terwijl de pot nog plaatsen heeft: dan
    // zit het plafond van zijn soort vol, en "uitverkocht" alleen zou liegen
    // tegen wie de andere soort is.
    const seatsGone = salesOpen && remaining < 1 && (type.poolAvailable ?? 0) > 0
      ? type.seat === "MEMBER"
        ? locale === "nl" ? "De plaatsen voor leden zijn op." : "The places for members are gone."
        : locale === "nl" ? "De plaatsen voor niet-leden zijn op." : "The places for non-members are gone."
      : null;

    if (!type.description && !note && !nonMembersLater && !low && !maximum && !seatsGone) return null;
    return (
      <p className="tshop-type-note">
        {type.description ? <span>{type.description}</span> : null}
        {note ? <span>{note}</span> : null}
        {nonMembersLater ? <span>{nonMembersLater}</span> : null}
        {seatsGone ? <span>{seatsGone}</span> : null}
        {maximum ? <span>{maximum}</span> : null}
        {low ? (
          <span className="tshop-pill" data-tone="low">
            {locale === "nl" ? `Nog ${remaining}` : `${remaining} left`}
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

  const trimmedBuyerName = buyerName.trim();
  const trimmedBuyerEmail = buyerEmail.trim();
  const firstActiveAttendee = activeAttendeeEntries[0]?.attendee;
  const buyerInfoForSlot = (globalIndex: number) => {
    if (!sameBuyer && (trimmedBuyerName || trimmedBuyerEmail)) {
      return { name: trimmedBuyerName, email: trimmedBuyerEmail };
    }
    if (
      sameBuyer &&
      globalIndex > 0 &&
      firstActiveAttendee &&
      (firstActiveAttendee.attendeeName.trim() || firstActiveAttendee.attendeeEmail.trim())
    ) {
      return {
        name: firstActiveAttendee.attendeeName.trim(),
        email: firstActiveAttendee.attendeeEmail.trim(),
      };
    }
    if (event.viewer && (event.viewer.name || event.viewer.email)) {
      return { name: event.viewer.name, email: event.viewer.email };
    }
    return null;
  };

  const resolvedBuyerName = sameBuyer
    ? (firstActiveAttendee?.attendeeName.trim() ?? "")
    : trimmedBuyerName;
  const resolvedBuyerEmail = sameBuyer
    ? (firstActiveAttendee?.attendeeEmail.trim() ?? "")
    : trimmedBuyerEmail;

  const detailsForm = (
    <div ref={detailsRef}>
      <form
        className="tshop-details"
        noValidate
        onSubmit={handleDetailsSubmit}
        aria-labelledby="ticket-details-heading"
      >
        <h2
          id="ticket-details-heading"
          className="tshop-heading"
          tabIndex={-1}
          ref={detailsHeadingRef}
        >
          {locale === "nl" ? "Jouw gegevens" : "Your details"}
        </h2>
        <p className="tshop-lede">
          {locale === "nl" ? "Elk ticket wordt op naam gezet." : "Each ticket is issued to one attendee."}
        </p>

        <div className="ticket-attendee-list">
          {activeAttendeeEntries.map(({ line, index, attendee }, globalIndex) => {
            const fieldPrefix = `${line.key}-${index}`;
            const nameId = `${fieldPrefix}-name`;
            const nameErrorId = `${nameId}-error`;
            const nameError = fieldErrors[nameId];
            const emailId = `${fieldPrefix}-email`;
            const emailErrorId = `${emailId}-error`;
            const emailError = fieldErrors[emailId];
            const isBlankAttendee =
              attendee.attendeeName.trim() === "" && attendee.attendeeEmail.trim() === "";
            const copySource = isBlankAttendee ? buyerInfoForSlot(globalIndex) : null;

            return (
              <fieldset className="ticket-attendee" key={fieldPrefix}>
                <legend>
                  <Ticket size={16} aria-hidden="true" />
                  {lineLabel(line, locale)} · {index + 1}
                </legend>
                {copySource ? (
                  <div className="ticket-attendee-actions">
                    <button
                      type="button"
                      className="ticket-copy-buyer"
                      aria-label={
                        locale === "nl"
                          ? `Zelfde als koper (${lineLabel(line, locale)} ${index + 1})`
                          : `Copy buyer details (${lineLabel(line, locale)} ${index + 1})`
                      }
                      onClick={() => {
                        updateAttendee(line.key, index, {
                          attendeeName: copySource.name,
                          attendeeEmail: copySource.email,
                        });
                        clearFieldError(nameId);
                        clearFieldError(emailId);
                        document.getElementById(nameId)?.focus();
                      }}
                    >
                      {locale === "nl" ? "Zelfde als koper" : "Copy buyer details"}
                    </button>
                  </div>
                ) : null}
                <div className="ticket-fields-grid">
                  <div className="ticket-field">
                    <label htmlFor={nameId}>
                      {locale === "nl" ? "Naam aanwezige" : "Attendee name"} *
                    </label>
                    <div className="ticket-input-icon">
                      <UserRound size={17} aria-hidden="true" />
                      <input
                        id={nameId}
                        value={attendee.attendeeName}
                        autoComplete={sameBuyer && globalIndex === 0 ? "name" : "off"}
                        required
                        aria-invalid={nameError ? true : undefined}
                        aria-describedby={nameError ? nameErrorId : undefined}
                        onChange={(event_) => {
                          updateAttendee(line.key, index, { attendeeName: event_.target.value });
                          clearFieldError(nameId);
                        }}
                      />
                    </div>
                    {nameError ? (
                      <small id={nameErrorId} className="ticket-field-error">
                        {nameError}
                      </small>
                    ) : null}
                  </div>
                  <div className="ticket-field">
                    <label htmlFor={emailId}>
                      {locale === "nl" ? "E-mail aanwezige" : "Attendee email"} *
                    </label>
                    <div className="ticket-input-icon">
                      <Mail size={17} aria-hidden="true" />
                      <input
                        id={emailId}
                        type="email"
                        value={attendee.attendeeEmail}
                        autoComplete={sameBuyer && globalIndex === 0 ? "email" : "off"}
                        required
                        aria-invalid={emailError ? true : undefined}
                        aria-describedby={emailError ? emailErrorId : undefined}
                        onChange={(event_) => {
                          updateAttendee(line.key, index, { attendeeEmail: event_.target.value });
                          clearFieldError(emailId);
                        }}
                      />
                    </div>
                    {emailError ? (
                      <small id={emailErrorId} className="ticket-field-error">
                        {emailError}
                      </small>
                    ) : null}
                  </div>
                  {(line.type.questions ?? []).map((question) => {
                    const qKey = `${fieldPrefix}-question-${question.id}`;
                    return (
                      <QuestionField
                        key={question.id}
                        question={question}
                        fieldPrefix={fieldPrefix}
                        value={attendee.answers[question.id]}
                        locale={locale}
                        error={fieldErrors[qKey]}
                        isFirstAttendee={globalIndex === 0}
                        onChange={(value) => {
                          updateAttendee(line.key, index, {
                            answers: { ...attendee.answers, [question.id]: value },
                          });
                          clearFieldError(qKey);
                        }}
                      />
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <label className="ticket-checkbox ticket-same-buyer">
          <input
            type="checkbox"
            checked={sameBuyer}
            onChange={(event_) => {
              const checked = event_.target.checked;
              setSameBuyer(checked);
              if (checked) {
                clearFieldError("buyer-name");
                clearFieldError("buyer-email");
              }
            }}
          />
          <span>
            {locale === "nl"
              ? "Stuur de bestelling naar de eerste aanwezige"
              : "Send the order to the first attendee"}
          </span>
        </label>

        {!sameBuyer ? (
          <fieldset className="ticket-attendee">
            <legend>{locale === "nl" ? "Gegevens koper" : "Buyer details"}</legend>
            <div className="ticket-fields-grid">
              <div className="ticket-field">
                <label htmlFor="ticket-buyer-name">
                  {locale === "nl" ? "Volledige naam" : "Full name"} *
                </label>
                <div className="ticket-input-icon">
                  <UserRound size={17} aria-hidden="true" />
                  <input
                    id="ticket-buyer-name"
                    value={buyerName}
                    autoComplete="name"
                    required
                    aria-invalid={fieldErrors["buyer-name"] ? true : undefined}
                    aria-describedby={fieldErrors["buyer-name"] ? "ticket-buyer-name-error" : undefined}
                    onChange={(event_) => {
                      setBuyerName(event_.target.value);
                      clearFieldError("buyer-name");
                    }}
                  />
                </div>
                {fieldErrors["buyer-name"] ? (
                  <small id="ticket-buyer-name-error" className="ticket-field-error">
                    {fieldErrors["buyer-name"]}
                  </small>
                ) : null}
              </div>
              <div className="ticket-field">
                <label htmlFor="ticket-buyer-email">
                  {locale === "nl" ? "E-mailadres" : "Email address"} *
                </label>
                <div className="ticket-input-icon">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    id="ticket-buyer-email"
                    type="email"
                    value={buyerEmail}
                    autoComplete="email"
                    required
                    aria-invalid={fieldErrors["buyer-email"] ? true : undefined}
                    aria-describedby={fieldErrors["buyer-email"] ? "ticket-buyer-email-error" : undefined}
                    onChange={(event_) => {
                      setBuyerEmail(event_.target.value);
                      clearFieldError("buyer-email");
                    }}
                  />
                </div>
                {fieldErrors["buyer-email"] ? (
                  <small id="ticket-buyer-email-error" className="ticket-field-error">
                    {fieldErrors["buyer-email"]}
                  </small>
                ) : null}
              </div>
            </div>
          </fieldset>
        ) : null}

        <div className="ticket-terms-wrap">
          <label className="ticket-checkbox ticket-terms-check" htmlFor="ticket-terms-accepted">
            <input
              id="ticket-terms-accepted"
              type="checkbox"
              checked={termsAccepted}
              aria-invalid={fieldErrors.terms ? true : undefined}
              aria-describedby={fieldErrors.terms ? "ticket-terms-accepted-error" : undefined}
              onChange={(event_) => {
                setTermsAccepted(event_.target.checked);
                clearFieldError("terms");
              }}
            />
            <span>
              <strong>
                {locale === "nl"
                  ? "Ik ga akkoord met de verkoop- en terugbetalingsvoorwaarden."
                  : "I agree to the sales and refund terms."}
              </strong>
            </span>
          </label>
          {event.termsUrl ? (
            <a className="ticket-terms-link" href={event.termsUrl} target="_blank" rel="noreferrer">
              {locale === "nl" ? "Lees de voorwaarden" : "Read the terms"}
            </a>
          ) : null}
          {fieldErrors.terms ? (
            <small id="ticket-terms-accepted-error" className="ticket-field-error">
              {fieldErrors.terms}
            </small>
          ) : null}
        </div>

        {totalCents > 0 ? (
          <div className="tshop-pay">
            <PaymentMethodChooser
              locale={locale}
              choice={paymentChoice}
              value={selectedProvider}
              onChange={(provider) => {
                setSelectedProvider(provider);
                clearFieldError("paymentProvider");
              }}
              disabled={submitting}
              error={fieldErrors.paymentProvider ?? null}
              errorId="ticket-payment-provider-error"
            />
          </div>
        ) : null}

        {error ? (
          <div className="ticket-error" role="alert">
            <AlertCircle size={17} aria-hidden="true" /> {error}
          </div>
        ) : null}

        <button className="tshop-cta" type="submit">
          <span>{locale === "nl" ? "Bestelling nakijken" : "Review order"}</span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>

        <p className="ticket-privacy-note">
          {locale === "nl"
            ? "VTK gebruikt deze gegevens om je bestelling uit te voeren, tickets te leveren, fraude te voorkomen en de boekhouding bij te houden. "
            : "VTK uses these details to fulfil your order, deliver tickets, prevent fraud and maintain accounting records. "}
          <a href={`${base}/privacy`} className="font-medium text-vtk-ink underline">
            {locale === "nl" ? "Lees de privacyverklaring." : "Read the privacy statement."}
          </a>
        </p>
      </form>
    </div>
  );

  const reviewSection = (
    <div ref={detailsRef}>
      <section className="tshop-details tshop-review" aria-labelledby="ticket-review-heading">
        <h2
          id="ticket-review-heading"
          className="tshop-heading"
          tabIndex={-1}
          ref={reviewHeadingRef}
        >
          {locale === "nl" ? "Bestelling nakijken" : "Review your order"}
        </h2>
        <p className="tshop-lede">
          {locale === "nl"
            ? "Controleer je gegevens voordat je de bestelling bevestigt."
            : "Check your details before confirming your order."}
        </p>

        <div className="tshop-review-section">
          <h3>{locale === "nl" ? "Event" : "Event"}</h3>
          <div className="tshop-review-event">
            <strong>
              {event.title}
              {event.label ? ` · ${event.label}` : null}
            </strong>
            <span>{formatTicketDate(event.startsAt, locale)}</span>
            {event.location ? <span>{event.location}</span> : null}
          </div>
        </div>

        <div className="tshop-review-section">
          <h3>{locale === "nl" ? "Gekozen tickets" : "Selected tickets"}</h3>
          <ul className="tshop-review-lines">
            {selectedLines.map((line) => {
              const qty = quantities[line.key] ?? 0;
              return (
                <li key={line.key}>
                  <span>
                    {qty} × {lineLabel(line, locale)}
                    {qty > 1
                      ? ` (${formatTicketPrice(line.priceCents, event.currency, locale)} ${locale === "nl" ? "per stuk" : "each"})`
                      : null}
                  </span>
                  <span>
                    {line.priceCents === 0
                      ? locale === "nl" ? "Gratis" : "Free"
                      : formatTicketPrice(qty * line.priceCents, event.currency, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="tshop-review-total">
            <span>{locale === "nl" ? "Totaal" : "Total"}</span>
            <strong>{formatTicketPrice(totalCents, event.currency, locale)}</strong>
          </div>
        </div>

        <div className="tshop-review-section">
          <h3>{locale === "nl" ? "Aanwezigen" : "Attendees"}</h3>
          <ul className="tshop-review-attendees">
            {activeAttendeeEntries.map(({ line, index, attendee }) => {
              const answered = (line.type.questions ?? [])
                .map((question) => ({
                  question,
                  answer: formatAnswerForReview(question, attendee.answers[question.id], locale),
                }))
                .filter((entry): entry is { question: TicketQuestion; answer: string } => entry.answer !== null);

              return (
                <li key={`${line.key}-${index}`}>
                  <span className="tshop-review-attendee-type">
                    {lineLabel(line, locale)} · {index + 1}
                  </span>
                  <strong>{attendee.attendeeName.trim()}</strong>
                  <span>{attendee.attendeeEmail.trim()}</span>
                  {answered.length > 0 ? (
                    <dl className="tshop-review-answers">
                      {answered.map(({ question, answer }) => (
                        <div key={question.id}>
                          <dt>{question.label}</dt>
                          <dd>{answer}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="tshop-review-section">
          <h3>{locale === "nl" ? "Koper en betaling" : "Buyer and payment"}</h3>
          <dl className="tshop-review-meta">
            <div>
              <dt>{locale === "nl" ? "Koper" : "Buyer"}</dt>
              <dd>{resolvedBuyerName}</dd>
            </div>
            <div>
              <dt>{locale === "nl" ? "Bevestiging naar" : "Confirmation to"}</dt>
              <dd>{resolvedBuyerEmail}</dd>
            </div>
            <div>
              <dt>{locale === "nl" ? "Betaalmethode" : "Payment method"}</dt>
              <dd>
                {totalCents === 0
                  ? locale === "nl" ? "Gratis bestelling" : "Free order"
                  : selectedProvider
                    ? PAYMENT_PROVIDER_LABELS[selectedProvider][locale]
                    : (locale === "nl" ? "Niet gekozen" : "Not selected")}
              </dd>
            </div>
          </dl>
        </div>

        <p className="tshop-review-notice">
          {locale === "nl"
            ? "Tickets worden na aankoop niet terugbetaald, behalve wanneer het event wordt geannuleerd of zoals bepaald in de verkoopvoorwaarden."
            : "Tickets are non-refundable after purchase, unless the event is cancelled or as set out in the sales terms."}
        </p>

        {error ? (
          <div className="ticket-error" role="alert">
            <AlertCircle size={17} aria-hidden="true" /> {error}
          </div>
        ) : null}

        <div className="tshop-review-actions">
          <button
            type="button"
            className="ticket-secondary-button"
            disabled={submitting}
            onClick={() => {
              setError(null);
              setCheckoutStep("details");
              setEditDetailsRequest((request) => request + 1);
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {locale === "nl" ? "Gegevens aanpassen" : "Edit details"}
          </button>
          <button
            type="button"
            className="tshop-cta"
            disabled={preview || !salesOpen || submitting}
            onClick={() => void submitCheckout()}
          >
            {submitting ? (
              <LoaderCircle className="is-spinning" size={18} aria-hidden="true" />
            ) : (
              <Check size={18} aria-hidden="true" />
            )}
            <span>
              {submitting
                ? locale === "nl" ? "Bestelling verwerken..." : "Processing order..."
                : totalCents === 0
                  ? locale === "nl" ? "Gratis tickets bevestigen" : "Confirm free tickets"
                  : locale === "nl" ? "Bestelling bevestigen en betalen" : "Confirm order and pay"}
            </span>
          </button>
        </div>

        {preview ? (
          <p className="tshop-muted">
            {locale === "nl" ? "Voorbeeld: bestellen is uitgeschakeld." : "Preview: ordering is disabled."}
          </p>
        ) : null}

        <p className="ticket-privacy-note">
          {locale === "nl"
            ? "VTK gebruikt deze gegevens om je bestelling uit te voeren, tickets te leveren, fraude te voorkomen en de boekhouding bij te houden. "
            : "VTK uses these details to fulfil your order, deliver tickets, prevent fraud and maintain accounting records. "}
          <a href={`${base}/privacy`} className="font-medium text-vtk-ink underline">
            {locale === "nl" ? "Lees de privacyverklaring." : "Read the privacy statement."}
          </a>
        </p>
      </section>
    </div>
  );

  // Op een smal scherm staat het ticketpaneel bovenaan in natuurlijke
  // DOM-volgorde, gevolgd door de gegevens/over-sectie en daarna het
  // praktische blok. Op breed scherm zet CSS Grid `.tshop-main` links en
  // `.tshop-panel` + `.tshop-practical` rechts.
  return (
    <div className="tshop">
      <aside className="tshop-panel" aria-labelledby="ticket-types-heading">
          <div className="tshop-panel-head">
            <h2 id="ticket-types-heading">Tickets</h2>
            {lines.length > 0 && !event.honoraryOneTicket?.used ? (
              <small>
                {locale === "nl"
                  ? `Max. ${limit} per bestelling`
                  : `Max. ${limit} per order`}
              </small>
            ) : null}
          </div>

          {choices}

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
              {event.requiresLogin && audienceHint ? (
                <p>
                  {audienceHint}{" "}
                  {locale === "nl"
                    ? "Er zijn tickets voor jou; log in om ze te zien."
                    : "There are tickets for you; sign in to see them."}
                </p>
              ) : null}
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
                              <span className="tshop-audience">{lineAudience(line, locale)}</span>
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

              {event.honoraryOneTicket ? (
                <p className="tshop-hint">
                  {event.honoraryOneTicket.used
                    ? locale === "nl"
                      ? "Als erelid koop je voor dit event één ticket, en dat heb je al."
                      : "As an honorary member you can buy one ticket for this event, and you already have it."
                    : locale === "nl"
                      ? "Als erelid koop je voor dit event één ticket."
                      : "As an honorary member you can buy one ticket for this event."}
                </p>
              ) : event.honoraryPriceUsed ? (
                <p className="tshop-hint">
                  {locale === "nl"
                    ? "Je erelidticket voor dit event heb je al."
                    : "You already have your honorary ticket for this event."}
                </p>
              ) : null}

              {/* Deze bezoeker wacht op de start voor niet-leden. Hij is geen lid,
                  of nog niet ingelogd; dat laatste zegt hem hoe het sneller kan.
                  Het neemt de plaats in van de hint over de ledenprijs, anders
                  staan er twee bijna dezelfde regels onder elkaar. */}
              {viewerWaitsForMembers ? (
                <p className="tshop-hint">
                  {event.viewer ? (
                    <>
                      {locale === "nl" ? "Leden kunnen nu al bestellen. " : "Members can already order. "}
                      <Link href={membershipHref}>{locale === "nl" ? "Word lid." : "Become a member."}</Link>
                    </>
                  ) : (
                    <>
                      {locale === "nl" ? "Lid van VTK? " : "VTK member? "}
                      <Link href={loginHref}>
                        {locale === "nl" ? "Log in, dan kan je nu al bestellen." : "Sign in to order right away."}
                      </Link>
                    </>
                  )}
                </p>
              ) : event.memberPriceHint ? (
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

              {audienceHint ? (
                <p className="tshop-hint">
                  {audienceHint}{" "}
                  <Link href={loginHref}>
                    {locale === "nl"
                      ? "Log in, er zijn ook tickets voor jou."
                      : "Sign in, there are tickets for you too."}
                  </Link>
                </p>
              ) : null}

              <div className="tshop-summary">
                <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {selectedCount === 0
                    ? locale === "nl"
                      ? "Geen tickets geselecteerd."
                      : "No tickets selected."
                    : locale === "nl"
                      ? `${selectedCount} ${selectedCount === 1 ? "ticket" : "tickets"} geselecteerd, totaal ${formatTicketPrice(totalCents, event.currency, locale)}.`
                      : `${selectedCount} ${selectedCount === 1 ? "ticket" : "tickets"} selected, total ${formatTicketPrice(totalCents, event.currency, locale)}.`}
                </p>
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
        <div className="tshop-main">
          {detailsOpen ? (checkoutStep === "review" ? reviewSection : detailsForm) : null}
          {about}
        </div>
        {practical ? <div className="tshop-practical">{practical}</div> : null}
    </div>
  );
}
