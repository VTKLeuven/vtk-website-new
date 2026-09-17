/**
 * De ticketsjablonen, kant van de webapp: types, het rekenen met offsets en het
 * lezen van wat een scherm terugstuurt.
 *
 * De sjablonen zelf staan in de databank (`TicketEventTemplate`) en worden
 * beheerd op /admin/tickets/sjablonen. Wat hier staat is bewust puur: dit
 * bestand wordt zowel door client components (het aanmaakscherm, het
 * beheerscherm) als door server actions geïmporteerd, dus geen Prisma en geen
 * server-only. Het lezen en schrijven gebeurt in `templateStore.ts`.
 *
 * **Een sjabloon bewaart offsets, geen datums.** Hetzelfde cantussjabloon moet
 * op elke dag neergezet kunnen worden, en de verkoop opent "drie dagen vooraf",
 * niet "op 19 september". `applyTicketTemplate` zet die offsets pas om zodra er
 * een startmoment gekozen is.
 */

import { ticketColorKey } from "./ticketColors";

export const TICKET_TEMPLATE_AUDIENCES = ["PUBLIC", "MEMBERS", "HONORARY"] as const;
export type TicketTemplateAudience = (typeof TICKET_TEMPLATE_AUDIENCES)[number];

export const TICKET_TEMPLATE_QUESTION_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "BOOLEAN",
] as const;
export type TicketTemplateQuestionType = (typeof TICKET_TEMPLATE_QUESTION_TYPES)[number];

/** Eén tickettype binnen een sjabloon, zoals de schermen het lezen. */
export type TicketTemplateType = {
  code: string;
  nameNl: string;
  nameEn: string;
  descriptionNl: string;
  descriptionEn: string;
  unitPriceCents: number;
  audience: TicketTemplateAudience;
  color: string;
  minPerOrder: number;
  maxPerOrder: number;
  /** Minuten vóór de start van het event; null = volgt het verkoopvenster van het event. */
  salesOpensMinutesBefore: number | null;
  salesClosesMinutesBefore: number | null;
  /** false = staat in het aanmaakscherm uitgevinkt. */
  enabled: boolean;
};

/** Eén deelnemersvraag binnen een sjabloon. */
export type TicketTemplateQuestion = {
  code: string;
  labelNl: string;
  labelEn: string;
  descriptionNl: string;
  descriptionEn: string;
  type: TicketTemplateQuestionType;
  required: boolean;
  options: string[];
  /** Enkel bij dit tickettype, op code; leeg = bij elk ticket. */
  ticketTypeCode: string | null;
};

/** Eén sjabloon met zijn tickettypes en vragen. */
export type TicketEventTemplate = {
  id: string;
  slug: string;
  label: string;
  note: string | null;
  ownerGroupId: string | null;
  titleNl: string;
  titleEn: string;
  descriptionNl: string;
  descriptionEn: string;
  location: string;
  locationAddress: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  /** Startuur "HH:mm"; null = 20:00. */
  timeOfDay: string | null;
  durationMinutes: number;
  salesOpensMinutesBefore: number | null;
  salesClosesMinutesBefore: number | null;
  maxTicketsPerOrder: number;
  contactEmail: string | null;
  cardCheckIn: boolean;
  openScanning: boolean;
  presaleLeadMinutes: number | null;
  presalePraesidium: boolean;
  confirmationMessageNl: string;
  confirmationMessageEn: string;
  capacity: number;
  /** Ticketontwerp, dezelfde vorm als `settings.ticketDesign.draft`; null = geen. */
  design: unknown;
  builtIn: boolean;
  types: TicketTemplateType[];
  questions: TicketTemplateQuestion[];
};

export const DEFAULT_TEMPLATE_TIME_OF_DAY = "20:00";
const MINUTE = 60_000;
const DAY_MINUTES = 1_440;

/** Het uur waarop een sjabloon standaard opent, met de terugval op 20:00. */
export const templateTimeOfDay = (template: Pick<TicketEventTemplate, "timeOfDay">) =>
  template.timeOfDay && /^([01]\d|2[0-3]):[0-5]\d$/.test(template.timeOfDay)
    ? template.timeOfDay
    : DEFAULT_TEMPLATE_TIME_OF_DAY;

/**
 * "4320" wordt "3 dagen vooraf", "120" wordt "2 uur vooraf" en 0 wordt "bij de
 * start". Zodat een scherm de offset kan tonen zonder dat iemand minuten moet
 * hoofdrekenen.
 */
export function formatMinutesBefore(minutes: number | null, locale: "nl" | "en" = "nl"): string {
  const nl = locale === "nl";
  if (minutes === null) return nl ? "niet ingesteld" : "not set";
  if (minutes === 0) return nl ? "bij de start" : "at the start";
  const after = minutes < 0;
  const value = Math.abs(minutes);
  const suffix = after ? (nl ? "na de start" : "after the start") : nl ? "vooraf" : "before";
  if (value % DAY_MINUTES === 0) {
    const days = value / DAY_MINUTES;
    const unit = nl ? (days === 1 ? "dag" : "dagen") : days === 1 ? "day" : "days";
    return `${days} ${unit} ${suffix}`;
  }
  if (value % 60 === 0) {
    const hours = value / 60;
    const unit = nl ? "uur" : hours === 1 ? "hour" : "hours";
    return `${hours} ${unit} ${suffix}`;
  }
  return `${value} ${nl ? "minuten" : "minutes"} ${suffix}`;
}

/** Een offset t.o.v. een startmoment naar een echte datum; null blijft null. */
export const dateFromMinutesBefore = (startsAt: Date, minutes: number | null): Date | null =>
  minutes === null ? null : new Date(startsAt.getTime() - minutes * MINUTE);

/** En terug: een datum naar minuten vóór de start; null blijft null. */
export const minutesBeforeFromDate = (startsAt: Date, date: Date | null | undefined): number | null =>
  date ? Math.round((startsAt.getTime() - date.getTime()) / MINUTE) : null;

/** Het sjabloon toegepast op een gekozen startmoment: offsets worden datums. */
export function applyTicketTemplate(
  template: Pick<
    TicketEventTemplate,
    "durationMinutes" | "salesOpensMinutesBefore" | "salesClosesMinutesBefore"
  >,
  startsAt: Date
) {
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + template.durationMinutes * MINUTE),
    salesStartAt: dateFromMinutesBefore(startsAt, template.salesOpensMinutesBefore),
    salesEndAt: dateFromMinutesBefore(startsAt, template.salesClosesMinutesBefore),
  };
}

/** Het verkoopvenster van één tickettype; null = volgt dat van het event. */
export function applyTicketTemplateType(type: TicketTemplateType, startsAt: Date) {
  return {
    salesStartAt: dateFromMinutesBefore(startsAt, type.salesOpensMinutesBefore),
    salesEndAt: dateFromMinutesBefore(startsAt, type.salesClosesMinutesBefore),
  };
}

// -----------------------------------------------------------------------------
// Lezen wat een scherm terugstuurt
// -----------------------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** Een offset mag ontbreken (null = volgt het event) maar niet onzin zijn. */
function optionalOffset(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return "invalid";
  // Een jaar vooraf tot een jaar erna: ruim genoeg voor elke verkoop, eng genoeg
  // om een tikfout ("40000 dagen") tegen te houden.
  if (parsed < -366 * DAY_MINUTES || parsed > 366 * DAY_MINUTES) return "invalid";
  return Math.round(parsed);
}

/** Een code als `BIERLID`: hoofdletters, cijfers en underscores. */
export function templateCode(value: unknown, fallback: string): string {
  const raw = text(value, 40)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return raw || fallback;
}

/**
 * De tickettypes zoals een scherm ze in één verborgen JSON-veld meestuurt.
 * Geeft óf de lijst terug, óf een Nederlandse zin die als toast kan verschijnen
 * ("Tickettype 3: geef het ticket een naam."). Zelfde vorm als
 * `parseTemplateEntries` bij de shiftsjablonen.
 */
export function parseTemplateTypes(raw: unknown): TicketTemplateType[] | string {
  if (!Array.isArray(raw)) return "Er kwamen geen tickettypes mee.";

  const seen = new Set<string>();
  const result: TicketTemplateType[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const row = asRecord(raw[index]);
    const label = `Tickettype ${index + 1}`;
    if (!row) return `${label}: onleesbare gegevens.`;

    const nameNl = text(row.nameNl, 160);
    if (nameNl === "") return `${label}: geef het ticket een naam.`;

    const code = templateCode(row.code, `TYPE_${index + 1}`);
    if (seen.has(code)) return `${label}: de code ${code} staat al op een ander ticket.`;
    seen.add(code);

    const price = integer(row.unitPriceCents, Number.NaN, 0, 99_999_999);
    if (!Number.isFinite(price)) return `${label}: vul een prijs in (0 voor een gratis ticket).`;

    const minPerOrder = integer(row.minPerOrder, 1, 1, 50);
    const maxPerOrder = integer(row.maxPerOrder, 8, 1, 50);
    if (maxPerOrder < minPerOrder) return `${label}: het maximum per bestelling ligt onder het minimum.`;

    const opens = optionalOffset(row.salesOpensMinutesBefore);
    const closes = optionalOffset(row.salesClosesMinutesBefore);
    if (opens === "invalid" || closes === "invalid") {
      return `${label}: het eigen verkoopvenster is geen geldige duur.`;
    }
    if (opens !== null && closes !== null && closes >= opens) {
      return `${label}: de verkoop moet sluiten na ze opent.`;
    }

    const audience = TICKET_TEMPLATE_AUDIENCES.includes(row.audience as TicketTemplateAudience)
      ? (row.audience as TicketTemplateAudience)
      : "PUBLIC";

    result.push({
      code,
      nameNl,
      nameEn: text(row.nameEn, 160),
      descriptionNl: text(row.descriptionNl, 2_000),
      descriptionEn: text(row.descriptionEn, 2_000),
      unitPriceCents: price,
      audience,
      color: ticketColorKey(row.color),
      minPerOrder,
      maxPerOrder,
      salesOpensMinutesBefore: opens,
      salesClosesMinutesBefore: closes,
      enabled: bool(row.enabled, true),
    });
  }

  return result;
}

/** Idem voor de deelnemersvragen. */
export function parseTemplateQuestions(raw: unknown): TicketTemplateQuestion[] | string {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return "Er kwamen geen vragen mee.";

  const seen = new Set<string>();
  const result: TicketTemplateQuestion[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const row = asRecord(raw[index]);
    const label = `Vraag ${index + 1}`;
    if (!row) return `${label}: onleesbare gegevens.`;

    const labelNl = text(row.labelNl, 300);
    if (labelNl === "") return `${label}: geef de vraag een tekst.`;

    const code = templateCode(row.code, `VRAAG_${index + 1}`);
    if (seen.has(code)) return `${label}: de code ${code} staat al op een andere vraag.`;
    seen.add(code);

    const type = TICKET_TEMPLATE_QUESTION_TYPES.includes(row.type as TicketTemplateQuestionType)
      ? (row.type as TicketTemplateQuestionType)
      : "SHORT_TEXT";

    const options = Array.isArray(row.options)
      ? row.options.map((option) => text(option, 200)).filter((option) => option !== "")
      : [];
    if ((type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") && options.length === 0) {
      return `${label}: een keuzevraag heeft minstens één antwoordmogelijkheid nodig.`;
    }

    const ticketTypeCode = text(row.ticketTypeCode, 40);

    result.push({
      code,
      labelNl,
      labelEn: text(row.labelEn, 300),
      descriptionNl: text(row.descriptionNl, 2_000),
      descriptionEn: text(row.descriptionEn, 2_000),
      type,
      required: bool(row.required, false),
      options,
      ticketTypeCode: ticketTypeCode === "" ? null : templateCode(ticketTypeCode, ticketTypeCode),
    });
  }

  return result;
}

/**
 * Het deel van een ticketontwerp dat een sjabloon mag dragen: de sjabloonkeuze,
 * de kleuren en de footer. **Geen afbeeldingen**: artwork en logo's staan in
 * object storage onder `ticket-design/<eventId>/` en worden bij het uitlezen
 * tegen dat ene event gecontroleerd (`design.ts:assertEventAssetKeys`), dus een
 * gekopieerde key hoort bij een ander event en laat het ontwerp stil terugvallen
 * op de standaard.
 */
export function templateDesign(draft: unknown): Record<string, unknown> | null {
  const record = asRecord(draft);
  if (!record) return null;
  const keep = ["template", "backgroundColor", "accentColor", "textColor", "footerNl", "footerEn"];
  const result: Record<string, unknown> = {};
  for (const key of keep) {
    if (record[key] !== undefined && record[key] !== null) result[key] = record[key];
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Een leeg sjabloon om een nieuw formulier mee te openen. */
export function blankTicketTemplate(): TicketEventTemplate {
  return {
    id: "",
    slug: "",
    label: "",
    note: null,
    ownerGroupId: null,
    titleNl: "",
    titleEn: "",
    descriptionNl: "",
    descriptionEn: "",
    location: "",
    locationAddress: null,
    locationLatitude: null,
    locationLongitude: null,
    timeOfDay: DEFAULT_TEMPLATE_TIME_OF_DAY,
    durationMinutes: 300,
    salesOpensMinutesBefore: 3 * DAY_MINUTES,
    salesClosesMinutesBefore: 0,
    maxTicketsPerOrder: 8,
    contactEmail: null,
    cardCheckIn: false,
    openScanning: true,
    presaleLeadMinutes: null,
    presalePraesidium: true,
    confirmationMessageNl: "",
    confirmationMessageEn: "",
    capacity: 100,
    design: null,
    builtIn: false,
    types: [blankTicketTemplateType(1)],
    questions: [],
  };
}

/** Een lege rij in de tickettypetabel van het beheerscherm. */
export function blankTicketTemplateType(index: number): TicketTemplateType {
  return {
    code: `TYPE_${index}`,
    nameNl: "",
    nameEn: "",
    descriptionNl: "",
    descriptionEn: "",
    unitPriceCents: 0,
    audience: "PUBLIC",
    color: "navy",
    minPerOrder: 1,
    maxPerOrder: 8,
    salesOpensMinutesBefore: null,
    salesClosesMinutesBefore: null,
    enabled: true,
  };
}

/** Prijs in cent naar het formulierformaat "14.00" en terug. */
export const centsToAmount = (cents: number) => (cents / 100).toFixed(2);
export const amountToCents = (value: string) => {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};
