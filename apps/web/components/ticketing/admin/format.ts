export type AdminLocale = "nl" | "en";

export function ticketBase(locale: AdminLocale) {
  return locale === "nl" ? "" : "/en";
}

export function formatMoney(cents: number, currency: string, locale: AdminLocale) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatDateTime(value: Date | null | undefined, locale: AdminLocale) {
  if (!value) return locale === "nl" ? "Niet ingesteld" : "Not set";
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(value);
}

export function formatDate(value: Date, locale: AdminLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    dateStyle: "medium",
    timeZone: "Europe/Brussels",
  }).format(value);
}

export function formatNumber(value: number, locale: AdminLocale) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE").format(value);
}

export function formatPercent(value: number, locale: AdminLocale) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.min(1, value)));
}

export function toDatetimeLocal(value: Date | null | undefined) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Brussels",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

const STATUS_LABELS: Record<string, [string, string]> = {
  DRAFT: ["Concept", "Draft"],
  PUBLISHED: ["Gepubliceerd", "Published"],
  SALES_PAUSED: ["Verkoop gepauzeerd", "Sales paused"],
  SALES_CLOSED: ["Verkoop gesloten", "Sales closed"],
  CANCELLED: ["Geannuleerd", "Cancelled"],
  ARCHIVED: ["Gearchiveerd", "Archived"],
  PENDING_PAYMENT: ["Wacht op betaling", "Awaiting payment"],
  PAID: ["Betaald", "Paid"],
  PAYMENT_FAILED: ["Betaling mislukt", "Payment failed"],
  EXPIRED: ["Verlopen", "Expired"],
  PARTIALLY_REFUNDED: ["Deels terugbetaald", "Partially refunded"],
  REFUNDED: ["Terugbetaald", "Refunded"],
  VALID: ["Geldig", "Valid"],
  VOID: ["Ongeldig", "Void"],
  SUCCEEDED: ["Geslaagd", "Succeeded"],
  FAILED: ["Mislukt", "Failed"],
  PENDING: ["In behandeling", "Pending"],
  CREATED: ["Aangemaakt", "Created"],
  ACTIVE: ["Actief", "Active"],
  INACTIVE: ["Inactief", "Inactive"],
  CHECKED_IN: ["Aanwezig", "Checked in"],
  NOT_CHECKED_IN: ["Niet aanwezig", "Not checked in"],
  ACCEPTED: ["Toegelaten", "Accepted"],
  ALREADY_USED: ["Al gebruikt", "Already used"],
  WRONG_EVENT: ["Verkeerd event", "Wrong event"],
  INVALID: ["Ongeldig", "Invalid"],
  REVERSED: ["Teruggedraaid", "Reversed"],
};

export function statusLabel(status: string, locale: AdminLocale) {
  const labels = STATUS_LABELS[status];
  if (!labels) return status.replaceAll("_", " ").toLowerCase();
  return labels[locale === "nl" ? 0 : 1];
}

export function statusTone(status: string) {
  if (["PUBLISHED", "PAID", "VALID", "SUCCEEDED", "ACTIVE", "ACCEPTED", "CHECKED_IN"].includes(status)) return "success";
  if (["CANCELLED", "PAYMENT_FAILED", "FAILED", "VOID", "REFUNDED", "WRONG_EVENT", "INVALID"].includes(status)) {
    return "danger";
  }
  if (["DRAFT", "ARCHIVED", "EXPIRED", "SALES_CLOSED", "INACTIVE", "REVERSED", "NOT_CHECKED_IN"].includes(status)) return "neutral";
  return "warning";
}
