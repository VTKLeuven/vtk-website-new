import { z } from "zod";

/**
 * Een ticket bestaat in twee versies, allebei uit hetzelfde ontwerp:
 *
 * - **kleur** (`TicketPdfVariant` "colour"): de evenementtegel van /kalender,
 *   met de affiche bovenaan en de gele datumpin over de onderrand;
 * - **print** ("print"): wit papier met het technische patroon in dunne lijnen,
 *   voor een zwart-witprinter. Geen inktvlakken, enkel lijnen en tekst.
 *
 * Zie docs/design-decisions.md, "De ticket-PDF in twee versies". De QR-code en
 * de ticketgegevens staan altijd in vlakken die de renderer zelf tekent, zodat
 * ze leesbaar en scanbaar blijven wat iemand ook kiest.
 */

/**
 * Het sjabloon van voor de twee versies (november 2026). Blijft in het schema
 * omdat uitgegeven tickets het in hun momentopname dragen; de renderer kijkt er
 * niet meer naar, en het ontwerpscherm toont het niet meer.
 */
export const TICKET_DESIGN_TEMPLATES = ["CLASSIC", "POSTER_ARTWORK", "SPLIT_ARTWORK"] as const;
export type TicketDesignTemplate = (typeof TICKET_DESIGN_TEMPLATES)[number];

/** De verhouding van de affiche bovenaan de kleurversie. */
export const TICKET_POSTER_RATIOS = ["16:9", "3:2", "2:1", "3:1"] as const;
export type TicketPosterRatio = (typeof TICKET_POSTER_RATIOS)[number];

export const TICKET_PDF_VARIANTS = ["colour", "print"] as const;
export type TicketPdfVariant = (typeof TICKET_PDF_VARIANTS)[number];

export function isTicketPdfVariant(value: unknown): value is TicketPdfVariant {
  return value === "colour" || value === "print";
}

const colourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "INVALID_COLOUR");
const storageKeySchema = z.string().min(1).max(500);
const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || undefined).optional();

const assetSchema = z.object({
  key: storageKeySchema,
  focalX: z.number().finite().min(0).max(100).default(50),
  focalY: z.number().finite().min(0).max(100).default(50),
});

/**
 * Elke optie heeft een standaard, zodat een momentopname van een ticket dat
 * vóór die optie uitgegeven werd, gewoon blijft parsen en er hetzelfde
 * uitziet als een nieuw ticket zonder die keuze.
 */
export const ticketDesignDraftSchema = z.object({
  template: z.enum(TICKET_DESIGN_TEMPLATES).default("CLASSIC"),
  /** De grond van de kleurversie. De printversie is altijd wit. */
  backgroundColor: colourSchema.default("#EFF2F8"),
  /** De datumpin, de streep onder de titel en de rand naast de QR. */
  accentColor: colourSchema.default("#FFD23F"),
  textColor: colourSchema.default("#0A0F1F"),
  artwork: assetSchema.optional(),
  eventLogoKey: storageKeySchema.optional(),
  sponsorLogoKey: storageKeySchema.optional(),
  footerNl: optionalText(280),
  footerEn: optionalText(280),
  /** Een eigen regel onder "Aan de ingang" (deuren open om, enkel 18+, ...). */
  noteNl: optionalText(280),
  noteEn: optionalText(280),
  posterRatio: z.enum(TICKET_POSTER_RATIOS).default("16:9"),
  showDatePin: z.boolean().default(true),
  showPrice: z.boolean().default(true),
  showOrderNumber: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  /** Het technische patroon in de kop van de printversie. */
  printPattern: z.boolean().default(true),
  /** De accentstreep in de printversie (op zwart-wit een lichtgrijze lijn). */
  printAccent: z.boolean().default(true),
});

export type TicketDesignDraft = z.output<typeof ticketDesignDraftSchema>;

export const ticketDesignSnapshotSchema = ticketDesignDraftSchema.extend({
  revision: z.number().int().min(0),
  publishedAt: z.string().datetime({ offset: true }),
});
export type TicketDesignSnapshot = z.output<typeof ticketDesignSnapshotSchema>;

export type TicketDesignSettings = {
  draft?: TicketDesignDraft;
  published?: TicketDesignSnapshot;
};

export const DEFAULT_TICKET_DESIGN: TicketDesignDraft = ticketDesignDraftSchema.parse({});

export const DEFAULT_TICKET_DESIGN_SNAPSHOT: TicketDesignSnapshot = {
  ...DEFAULT_TICKET_DESIGN,
  revision: 1,
  publishedAt: "1970-01-01T00:00:00.000Z",
};

/**
 * De standaardkleuren van voor november 2026: het warme papier en een ander
 * geel dan de site. Tickets dragen die als momentopname; wie ze nooit zelf
 * koos, krijgt bij het tekenen de kleuren van de site. Een bewust gekozen
 * kleur blijft staan.
 */
const LEGACY_DEFAULT_COLOURS: Record<string, string> = {
  "#F8F8F5": "#EFF2F8",
  "#F2B632": "#FFD23F",
};

export function withCurrentDefaultColours<T extends { backgroundColor: string; accentColor: string }>(design: T): T {
  return {
    ...design,
    backgroundColor: LEGACY_DEFAULT_COLOURS[design.backgroundColor.toUpperCase()] ?? design.backgroundColor,
    accentColor: LEGACY_DEFAULT_COLOURS[design.accentColor.toUpperCase()] ?? design.accentColor,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A key is never a public URL. This prevents a PDF renderer from fetching a
 * remote image and keeps event artwork compartmentalised in object storage. */
export function ticketDesignAssetPrefix(eventId: string): string {
  return `ticket-design/${eventId}/`;
}

export function isTicketDesignAssetKey(eventId: string, key: string | undefined): boolean {
  return !key || key.startsWith(ticketDesignAssetPrefix(eventId));
}

function assertEventAssetKeys(design: TicketDesignDraft, eventId: string): TicketDesignDraft {
  const keys = [design.artwork?.key, design.eventLogoKey, design.sponsorLogoKey];
  if (!keys.every((key) => isTicketDesignAssetKey(eventId, key))) {
    throw new Error("INVALID_TICKET_DESIGN_ASSET");
  }
  return design;
}

export function parseTicketDesignDraft(input: unknown, eventId: string): TicketDesignDraft {
  return assertEventAssetKeys(ticketDesignDraftSchema.parse(input), eventId);
}

export function readTicketDesignSettings(settings: unknown, eventId: string): TicketDesignSettings {
  if (!isRecord(settings) || !isRecord(settings.ticketDesign)) return {};
  const source = settings.ticketDesign;
  try {
    const draft = source.draft == null ? undefined : parseTicketDesignDraft(source.draft, eventId);
    const published = source.published == null
      ? undefined
      : ticketDesignSnapshotSchema.parse(source.published);
    if (published) assertEventAssetKeys(published, eventId);
    return { draft, published };
  } catch {
    // Bad legacy JSON must never make ticket delivery unavailable. A manager can
    // simply save a fresh draft to replace it.
    return {};
  }
}

export function publishedTicketDesign(settings: unknown, eventId: string): TicketDesignSnapshot {
  return readTicketDesignSettings(settings, eventId).published ?? DEFAULT_TICKET_DESIGN_SNAPSHOT;
}

export function ticketDesignSnapshot(input: unknown, eventId: string): TicketDesignSnapshot {
  try {
    const snapshot = ticketDesignSnapshotSchema.parse(input);
    return assertEventAssetKeys(snapshot, eventId) as TicketDesignSnapshot;
  } catch {
    return DEFAULT_TICKET_DESIGN_SNAPSHOT;
  }
}

export function ticketDesignSettingsWith(
  settings: unknown,
  design: TicketDesignSettings
): Record<string, unknown> {
  return {
    ...(isRecord(settings) ? settings : {}),
    ticketDesign: design,
  };
}
