import { z } from "zod";

/** The printable area is deliberately constrained: ticket data and the QR code
 * always remain in renderer-controlled, high-contrast safe areas. */
export const TICKET_DESIGN_TEMPLATES = ["CLASSIC", "POSTER_ARTWORK", "SPLIT_ARTWORK"] as const;
export type TicketDesignTemplate = (typeof TICKET_DESIGN_TEMPLATES)[number];

const colourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "INVALID_COLOUR");
const storageKeySchema = z.string().min(1).max(500);
const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || undefined).optional();

const assetSchema = z.object({
  key: storageKeySchema,
  focalX: z.number().finite().min(0).max(100).default(50),
  focalY: z.number().finite().min(0).max(100).default(50),
});

export const ticketDesignDraftSchema = z.object({
  template: z.enum(TICKET_DESIGN_TEMPLATES).default("CLASSIC"),
  backgroundColor: colourSchema.default("#F8F8F5"),
  accentColor: colourSchema.default("#F2B632"),
  textColor: colourSchema.default("#0A0F1F"),
  artwork: assetSchema.optional(),
  eventLogoKey: storageKeySchema.optional(),
  sponsorLogoKey: storageKeySchema.optional(),
  footerNl: optionalText(280),
  footerEn: optionalText(280),
});

export type TicketDesignDraft = z.output<typeof ticketDesignDraftSchema>;

/** Revision 0 is the unpublished draft the admin preview renders; a published
 * snapshot copied onto a ticket always starts at 1. Rejecting 0 here made the
 * preview silently fall back to the default design (the parse throws and
 * `ticketDesignSnapshot` swallows it), so the editor showed the same ticket no
 * matter what anyone changed. */
export const ticketDesignSnapshotSchema = ticketDesignDraftSchema.extend({
  revision: z.number().int().min(0),
  publishedAt: z.string().datetime({ offset: true }),
});
export type TicketDesignSnapshot = z.output<typeof ticketDesignSnapshotSchema>;

export type TicketDesignSettings = {
  draft?: TicketDesignDraft;
  published?: TicketDesignSnapshot;
};

export const DEFAULT_TICKET_DESIGN: TicketDesignDraft = {
  template: "CLASSIC",
  backgroundColor: "#F8F8F5",
  accentColor: "#F2B632",
  textColor: "#0A0F1F",
};

export const DEFAULT_TICKET_DESIGN_SNAPSHOT: TicketDesignSnapshot = {
  ...DEFAULT_TICKET_DESIGN,
  revision: 1,
  publishedAt: "1970-01-01T00:00:00.000Z",
};

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
