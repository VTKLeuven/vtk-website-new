/**
 * De regel die van een geluidsmeting een barstatus maakt. Zuiver en zonder I/O,
 * zodat ze getest kan worden zonder Munisense of database.
 *
 * "Open" is hier een afgeleide, geen waarheid: we meten geluid, geen deur. Zie
 * docs/design-decisions.md voor waarom we die gok maken en hoe voorzichtig we
 * ermee omgaan (bij twijfel: dicht).
 */

import type { ElixirThresholds } from "./config";
import type { SoundEvent } from "./munisenseParse";
import { withinOpeningWindow, type OpeningWindowSchedule } from "./openingWindow";

export type BarStatusState = {
  isOpen: boolean;
  currentDecibels: number | null;
  /** Wanneer de meting genomen is, ISO 8601. */
  lastUpdated: string;
  /** Opeenvolgende stille cycli; voedt de hysterese bij de volgende evaluatie. */
  quietCycles: number;
  eventId: string | null;
  /** Waarom de status is wat ze is; handig in de worker-log en bij support. */
  reason: BarStatusReason;
};

export type BarStatusReason =
  | "open"
  | "outside-hours"
  | "no-event"
  | "event-inactive"
  | "meter-offline"
  | "no-measurement"
  | "measurement-stale"
  | "too-quiet";

export type EvaluateInput = {
  event: SoundEvent | null;
  /** Rapporteert de meter (`is_active`)? Zo niet, dan weten we niets. */
  meterActive: boolean;
  decibels: number | null;
  sampledAt: Date | null;
  now: Date;
  /** De vorige status, voor de hysterese. */
  previous: Pick<BarStatusState, "isOpen" | "quietCycles"> | null;
  thresholds: ElixirThresholds;
  schedule?: OpeningWindowSchedule;
};

function closed(
  reason: BarStatusReason,
  decibels: number | null,
  eventId: string | null,
  now: Date
): BarStatusState {
  return {
    isOpen: false,
    currentDecibels: decibels,
    lastUpdated: now.toISOString(),
    quietCycles: 0,
    eventId,
    reason,
  };
}

export function evaluateStatus(input: EvaluateInput): BarStatusState {
  const { event, meterActive, decibels, sampledAt, now, previous, thresholds } = input;

  // Buiten de openingsuren beslist het rooster, niet de meter: lawaai op een
  // zaterdagmiddag is geen open bar. Zie openingWindow.ts.
  if (!withinOpeningWindow(now, input.schedule)) return closed("outside-hours", null, event?.id ?? null, now);

  // Er hoort altijd een soundevent te lopen (Munisense maakt er elke dag een).
  // Is dat niet zo, dan klopt er iets niet aan de meter of aan onze query, en
  // dan doen we geen uitspraak over de bar.
  if (!event) return closed("no-event", null, null, now);
  if (!event.active) return closed("event-inactive", null, event.id, now);
  if (!meterActive) return closed("meter-offline", null, event.id, now);
  if (decibels === null) return closed("no-measurement", null, event.id, now);

  // Een oude meting zegt niets over nu. Liever "dicht" dan een bar die volgens
  // de site al twee uur open is omdat de laatste meting blijft hangen.
  if (sampledAt && now.getTime() - sampledAt.getTime() > thresholds.sampleMaxAgeMs) {
    return closed("measurement-stale", decibels, event.id, now);
  }

  if (decibels >= thresholds.openDb) {
    return {
      isOpen: true,
      currentDecibels: decibels,
      lastUpdated: now.toISOString(),
      quietCycles: 0,
      eventId: event.id,
      reason: "open",
    };
  }

  // Hysterese: een open bar blijft open zolang ze boven de sluitdrempel zit, en
  // sluit pas na een paar stille cycli op rij. Zonder dit knippert de badge
  // tussen twee nummers door.
  if (previous?.isOpen) {
    if (decibels >= thresholds.closeDb) {
      return {
        isOpen: true,
        currentDecibels: decibels,
        lastUpdated: now.toISOString(),
        quietCycles: 0,
        eventId: event.id,
        reason: "open",
      };
    }
    const quietCycles = previous.quietCycles + 1;
    if (quietCycles < thresholds.quietCyclesToClose) {
      return {
        isOpen: true,
        currentDecibels: decibels,
        lastUpdated: now.toISOString(),
        quietCycles,
        eventId: event.id,
        reason: "open",
      };
    }
  }

  return closed("too-quiet", decibels, event.id, now);
}

/** Vorm zoals de rest van de app de status leest. */
export type BarStatus = {
  isOpen: boolean;
  currentDecibels: number | null;
  lastUpdated: string;
  /** De cache is te oud om nog iets over "nu" te zeggen (worker plat?). */
  stale: boolean;
};

export function isStale(lastUpdated: string, now: Date, maxAgeMs: number): boolean {
  const updated = new Date(lastUpdated).getTime();
  if (Number.isNaN(updated)) return true;
  return now.getTime() - updated > maxAgeMs;
}

/** Parse van een opgeslagen cachewaarde; onbruikbare JSON geeft null. */
export function parseStoredStatus(value: unknown): BarStatusState | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const lastUpdated = typeof row.lastUpdated === "string" ? row.lastUpdated : null;
  if (!lastUpdated || Number.isNaN(new Date(lastUpdated).getTime())) return null;
  const decibels = typeof row.currentDecibels === "number" ? row.currentDecibels : null;
  const quietCycles = typeof row.quietCycles === "number" ? row.quietCycles : 0;
  return {
    isOpen: row.isOpen === true,
    currentDecibels: decibels,
    lastUpdated,
    quietCycles: Number.isFinite(quietCycles) ? quietCycles : 0,
    eventId: typeof row.eventId === "string" ? row.eventId : null,
    reason: typeof row.reason === "string" ? (row.reason as BarStatusReason) : "no-event",
  };
}
