import { z } from "zod";

/**
 * De cijfers en instellingen van de 24 urenloop op vtk.be.
 *
 * Zuivere types, validatie en regels zonder server-imports, zodat zowel de
 * API-route (`/api/24ul-app/stats`), de publieke componenten (`UrenloopFrontpage`
 * en `PageView`) als de tests dezelfde logica gebruiken.
 */

export const URENLOOP_CONFIG_KEY = "urenloop.config";
export const URENLOOP_STATS_KEY = "urenloop.stats";

/** De markering die een redacteur op een eigen regel in een pagina zet. */
export const URENLOOP_MARKER = "[[24urenloop]]";

const MARKER_LINE = /^[ \t]*\[\[[ \t]*24urenloop[ \t]*\]\][ \t]*$/im;

/**
 * Splitst markdown op de eerste `[[24urenloop]]`-regel. Staat de markering er
 * niet in, dan is `after` gelijk aan `null`.
 */
export function splitOnUrenloopMarker(markdown: string): {
  before: string;
  after: string | null;
} {
  const match = MARKER_LINE.exec(markdown);
  if (!match) return { before: markdown, after: null };
  return {
    before: markdown.slice(0, match.index).replace(/\s+$/, ""),
    after: markdown.slice(match.index + match[0].length).replace(/^\n+/, ""),
  };
}

/**
 * Haalt `[[24urenloop]]` uit de tekst wanneer er niets te tonen is (bv. na
 * `showResultsUntil`), zodat de ruwe markering nooit op de pagina blijft staan.
 */
export function stripUrenloopMarker(markdown: string): string {
  const { before, after } = splitOnUrenloopMarker(markdown);
  if (after === null) return markdown;
  if (!after) return before;
  if (!before) return after;
  return `${before}\n\n${after}`;
}

export function hasUrenloopMarker(markdown: string): boolean {
  return MARKER_LINE.test(markdown);
}

const isoDateString = z
  .string()
  .trim()
  .refine((val) => !Number.isNaN(Date.parse(val)), "Invalid ISO timestamp");

const lapLeaderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  laps: z.number().int().positive().max(100_000),
});

const fastestLapLeaderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  seconds: z.number().positive().max(86_400),
  time: z.string().trim().min(1).max(32),
});

export const urenloopStatsPayloadSchema = z.object({
  eventStart: isoDateString,
  endsAt: isoDateString,
  generatedAt: isoDateString,
  lastLapAt: isoDateString,
  final: z.boolean(),
  frozenAt: isoDateString.nullable(),
  totals: z.object({
    laps: z.number().int().nonnegative().max(1_000_000),
    km: z.number().nonnegative().max(1_000_000),
  }),
  mostLaps: z.array(lapLeaderSchema).max(10),
  fastestLap: z.array(fastestLapLeaderSchema).max(10),
  firstYearMostLaps: z.array(lapLeaderSchema).max(10),
  groups: z.array(lapLeaderSchema).max(10),
});

export type UrenloopStatsPayload = z.infer<typeof urenloopStatsPayloadSchema>;

export type UrenloopConfig = {
  startsAt: string | null;
  endsAt: string | null;
  showResultsUntil: string | null;
};

export type StoredUrenloopStats = {
  payload: UrenloopStatsPayload;
  receivedAt: string;
  deviceId: string;
  deviceLabel: string;
  deviceEmail: string;
};

export function parseUrenloopConfig(raw: unknown): UrenloopConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { startsAt: null, endsAt: null, showResultsUntil: null };
  }
  const obj = raw as Record<string, unknown>;
  const isoOrNull = (val: unknown): string | null => {
    if (typeof val !== "string" || !val.trim()) return null;
    const ms = Date.parse(val);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  };
  return {
    startsAt: isoOrNull(obj.startsAt),
    endsAt: isoOrNull(obj.endsAt),
    showResultsUntil: isoOrNull(obj.showResultsUntil),
  };
}

export function parseStoredUrenloopStats(raw: unknown): StoredUrenloopStats | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const parsedPayload = urenloopStatsPayloadSchema.safeParse(obj.payload);
  if (!parsedPayload.success) return null;
  if (typeof obj.receivedAt !== "string" || Number.isNaN(Date.parse(obj.receivedAt))) {
    return null;
  }
  return {
    payload: parsedPayload.data,
    receivedAt: obj.receivedAt,
    deviceId: typeof obj.deviceId === "string" ? obj.deviceId : "",
    deviceLabel: typeof obj.deviceLabel === "string" ? obj.deviceLabel : "",
    deviceEmail: typeof obj.deviceEmail === "string" ? obj.deviceEmail : "",
  };
}

const PRE_START_TOLERANCE_MS = 30 * 24 * 3_600_000;
const DEFAULT_RESULTS_WINDOW_MS = 7 * 24 * 3_600_000;
export const STALE_STATS_MS = 15 * 60_000;

function resolveEditionBounds(config: UrenloopConfig): {
  startsAtMs: number;
  endsAtMs: number;
  untilMs: number;
} | null {
  if (!config.startsAt) return null;
  const startsAtMs = Date.parse(config.startsAt);
  if (Number.isNaN(startsAtMs)) return null;

  const endsAtMs = config.endsAt
    ? Date.parse(config.endsAt)
    : startsAtMs + 24 * 3_600_000;
  const untilMs = config.showResultsUntil
    ? Date.parse(config.showResultsUntil)
    : endsAtMs + DEFAULT_RESULTS_WINDOW_MS;
  if (Number.isNaN(endsAtMs) || Number.isNaN(untilMs)) return null;

  return { startsAtMs, endsAtMs, untilMs };
}

/**
 * Hoort een `eventStart` bij de geconfigureerde editie?
 *
 * We laten een ruime marge vóór `startsAt` toe zodat een eerder gestarte of
 * test-database tijdens de editie altijd werkt, maar cijfers van een vorig
 * academiejaar nooit opnieuw opduiken wanneer je het volgende jaar instelt.
 */
export function isWithinConfiguredEdition(
  eventStartIso: string,
  config: UrenloopConfig,
  now = new Date(),
): boolean {
  const bounds = resolveEditionBounds(config);
  const eventStartMs = Date.parse(eventStartIso);
  if (!bounds || Number.isNaN(eventStartMs)) return false;

  if (now.getTime() > bounds.untilMs) return false;
  if (eventStartMs < bounds.startsAtMs - PRE_START_TOLERANCE_MS) return false;
  if (eventStartMs > bounds.endsAtMs + PRE_START_TOLERANCE_MS) return false;
  return true;
}

export type StatsAcceptance =
  | { accept: true }
  | {
      accept: false;
      reason:
        | "OUTSIDE_EDITION_WINDOW"
        | "OLDER_EDITION"
        | "STALE_BACKUP_DEVICE"
        | "ALREADY_FINAL";
    };

/**
 * Beslist of een binnengekomen tussenstand de huidige mag vervangen.
 *
 * - **Tijdens de publieke weergaveperiode** (`startsAt <= now <= showResultsUntil`):
 *   alleen een run waarvan `eventStart` binnen de geconfigureerde editie valt
 *   wordt aanvaard (`OUTSIDE_EDITION_WINDOW` anders). Zo kan een laptop met een
 *   oude of test-database tijdens de loop of de eindstandperiode de site nooit
 *   overschrijven.
 * - **Vóór het startschot** (of wanneer er nog geen startuur ingesteld is):
 *   test-pushes vanaf een gekoppelde laptop worden wél opgeslagen zodat Sport en
 *   IT op `/admin/24urenloop` ("Live tussenstand van de piste") kunnen zien dat
 *   de verbinding werkt, terwijl de publieke site op de aftelklok blijft staan.
 * - Binnen dezelfde race (`eventStart` gelijk) weigeren we een pakket van een
 *   *andere* computer wanneer diens laatste ronde ouder is dan wat we al hebben,
 *   of wanneer de race al op `final` staat.
 * - Komt het pakket van *dezelfde* computer, dan mag het aantal ronden of
 *   `lastLapAt` wel zakken: dat is een correctie door de jury op de actieve
 *   timinglaptop (`/change` of `/status`).
 */
export function shouldAcceptUrenloopStats(args: {
  incoming: UrenloopStatsPayload;
  incomingDeviceId: string;
  existing: StoredUrenloopStats | null;
  config: UrenloopConfig;
  now?: Date;
}): StatsAcceptance {
  const { incoming, incomingDeviceId, existing, config, now = new Date() } = args;
  const bounds = resolveEditionBounds(config);
  const inActiveEditionWindow =
    bounds !== null &&
    now.getTime() >= bounds.startsAtMs &&
    now.getTime() <= bounds.untilMs;

  if (inActiveEditionWindow && !isWithinConfiguredEdition(incoming.eventStart, config, now)) {
    return { accept: false, reason: "OUTSIDE_EDITION_WINDOW" };
  }

  if (!existing) return { accept: true };

  // Als de bestaande cijfers van een testloop buiten de editie waren en de nieuwe
  // wél binnen de editie valt, wint de echte editie altijd.
  if (
    isWithinConfiguredEdition(incoming.eventStart, config, now) &&
    !isWithinConfiguredEdition(existing.payload.eventStart, config, now)
  ) {
    return { accept: true };
  }

  // Zelfde laptop mag ook vóór de race een nieuwe testrun starten of wissen/corrigeren.
  if (incomingDeviceId && incomingDeviceId === existing.deviceId) {
    return { accept: true };
  }

  const incomingRunMs = Date.parse(incoming.eventStart);
  const existingRunMs = Date.parse(existing.payload.eventStart);

  if (incomingRunMs < existingRunMs) {
    return { accept: false, reason: "OLDER_EDITION" };
  }
  if (incomingRunMs > existingRunMs) {
    return { accept: true };
  }

  if (existing.payload.final && !incoming.final) {
    return { accept: false, reason: "ALREADY_FINAL" };
  }

  const incomingLastLapMs = Date.parse(incoming.lastLapAt);
  const existingLastLapMs = Date.parse(existing.payload.lastLapAt);
  if (incomingLastLapMs < existingLastLapMs) {
    return { accept: false, reason: "STALE_BACKUP_DEVICE" };
  }

  return { accept: true };
}

export type PublicUrenloopState =
  | {
      phase: "countdown";
      startsAt: Date;
      endsAt: Date | null;
    }
  | {
      phase: "live" | "final";
      startsAt: Date | null;
      endsAt: Date;
      stats: UrenloopStatsPayload;
      receivedAt: Date;
      stale: boolean;
    };

/**
 * Wat de publieke site (`UrenloopFrontpage` en `[[24urenloop]]`) op dit moment
 * moet tonen, of `null` wanneer er geen editie gepland is of `showResultsUntil`
 * voorbij is.
 *
 * Zolang het ingestelde startschot (`startsAt`) nog niet geweest is, toont de
 * publieke site **altijd** de aftelklok — ook als er in `/admin/24urenloop` al
 * een test-tussenstand binnengekomen is.
 */
export function resolvePublicUrenloopState(
  config: UrenloopConfig,
  stored: StoredUrenloopStats | null,
  now = new Date(),
): PublicUrenloopState | null {
  if (!config.startsAt) return null;

  const startsAt = new Date(config.startsAt);
  const endsAt = config.endsAt ? new Date(config.endsAt) : null;
  const until = config.showResultsUntil
    ? new Date(config.showResultsUntil)
    : endsAt
      ? new Date(endsAt.getTime() + DEFAULT_RESULTS_WINDOW_MS)
      : new Date(startsAt.getTime() + 24 * 3_600_000 + DEFAULT_RESULTS_WINDOW_MS);

  if (now > until) return null;

  if (now < startsAt) {
    return {
      phase: "countdown",
      startsAt,
      endsAt,
    };
  }

  const validStored =
    stored && isWithinConfiguredEdition(stored.payload.eventStart, config, now)
      ? stored
      : null;

  if (validStored) {
    const receivedAt = new Date(validStored.receivedAt);
    const effectiveEndsAt = endsAt ?? new Date(validStored.payload.endsAt);
    const isFinal = validStored.payload.final;
    const stale =
      !isFinal &&
      !validStored.payload.frozenAt &&
      now.getTime() - receivedAt.getTime() > STALE_STATS_MS;
    return {
      phase: isFinal ? "final" : "live",
      startsAt,
      endsAt: effectiveEndsAt,
      stats: validStored.payload,
      receivedAt,
      stale,
    };
  }

  return {
    phase: "countdown",
    startsAt,
    endsAt,
  };
}

