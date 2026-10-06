/**
 * Instellingen van de fakscanner: de kaartlezer aan de bar van 't ElixIr waar een
 * lid één keer per avond incheckt en om de zoveel punten een gratis pint krijgt.
 *
 * Dit bestand is **zuiver**: geen prisma, geen env, geen tijdzone. Het staat hier
 * en niet in een app omdat twee apps het nodig hebben: de scan-API op vtk.be leest
 * dezelfde rij als het beheerscherm in de fakbar-app. Zelfde patroon als
 * `@vtk/db/permissions`.
 *
 * De rekenregels die wél een klok nodig hebben (bardag, dubbeltelvenster, gratis
 * pint) blijven in `apps/web/lib/fakscanner.ts` staan: die horen bij de scan-API,
 * en enkel die past ze toe.
 */

export type FakscannerConfig = {
  /** Aantal punten per gratis pint. */
  rewardEvery: number;
  /** Staat het dubbeltelvenster aan? */
  doubleEnabled: boolean;
  /** Begin van het dubbeltelvenster, "HH:mm" Brusselse wandklok. */
  doubleStart: string;
  /** Einde van het dubbeltelvenster (exclusief), "HH:mm". Mag over middernacht. */
  doubleEnd: string;
  /**
   * Tijdstip waarop een nieuwe bardag begint, "HH:mm" Brusselse wandklok. Een
   * fakavond loopt over middernacht, dus de kalenderdag deugt niet als "één keer
   * per dag"-grens.
   */
  dayRolloverTime: string;
};

/** De rij in `Setting` waar de instellingen hierboven in staan. */
export const FAKSCANNER_SETTING_KEY = "fakscanner.config";

export const DEFAULT_FAKSCANNER_CONFIG: FakscannerConfig = {
  rewardEvery: 10,
  doubleEnabled: true,
  doubleStart: "22:00",
  doubleEnd: "23:00",
  dayRolloverTime: "06:00",
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function coerceInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function coerceTime(value: unknown, fallback: string): string {
  return typeof value === "string" && HHMM.test(value) ? value : fallback;
}

/** Leest de opgeslagen JSON uit `Setting`; onbekende of kapotte velden vallen terug. */
export function parseFakscannerConfig(value: unknown): FakscannerConfig {
  const v = (value ?? {}) as Partial<Record<keyof FakscannerConfig, unknown>>;
  return {
    rewardEvery: coerceInt(v.rewardEvery, DEFAULT_FAKSCANNER_CONFIG.rewardEvery, 1, 1000),
    doubleEnabled:
      typeof v.doubleEnabled === "boolean"
        ? v.doubleEnabled
        : DEFAULT_FAKSCANNER_CONFIG.doubleEnabled,
    doubleStart: coerceTime(v.doubleStart, DEFAULT_FAKSCANNER_CONFIG.doubleStart),
    doubleEnd: coerceTime(v.doubleEnd, DEFAULT_FAKSCANNER_CONFIG.doubleEnd),
    dayRolloverTime: coerceTime(v.dayRolloverTime, DEFAULT_FAKSCANNER_CONFIG.dayRolloverTime),
  };
}



// ── Periodes ────────────────────────────────────────────────────────────────

/**
 * De regels van een periode (`FakPeriod`). Tijdens een groot evenement telt de
 * scanner niet één keer per bardag maar één keer per tijdvak (standaard elk uur),
 * enkel binnen een dagelijks venster, in een eigen teller met een eigen pintregel.
 * Zolang een periode loopt, staat de gewone werking stil.
 *
 * Ook hier geen klok: welk tijdvak het nu is, rekent `apps/web/lib/fakscanner.ts`
 * uit. Zie docs/design-decisions.md ("Periodes voor een groot evenement").
 */
export type FakPeriodRules = {
  startsAt: Date;
  /** Exclusief: om dit moment telt alles weer zoals altijd. */
  endsAt: Date;
  /** Begin van het dagelijkse venster, "HH:mm" Brusselse wandklok; null = de hele periode door. */
  windowStart: string | null;
  /** Einde van het venster (exclusief), "HH:mm". Mag over middernacht. */
  windowEnd: string | null;
  /** Eén check-in per zoveel minuten. De tijdvakken beginnen op het begin van het venster. */
  intervalMinutes: number;
  /** Uit = tijdens deze periode geen gratis pinten. */
  rewardEnabled: boolean;
  /** Check-ins in deze periode per gratis pint. */
  rewardEvery: number;
};

export const FAK_PERIOD_INTERVAL_MIN = 5;
export const FAK_PERIOD_INTERVAL_MAX = 1440;

/**
 * Wat een nieuwe periode voorstelt: de nacht door, elk uur, zodat wie overdag in
 * de bar werkt er geen check-ins bij spaart.
 */
export const DEFAULT_FAK_PERIOD_RULES = {
  windowStart: "22:00",
  windowEnd: "10:00",
  intervalMinutes: 60,
  rewardEnabled: true,
  rewardEvery: DEFAULT_FAKSCANNER_CONFIG.rewardEvery,
} as const;

export type FakPeriodError =
  | "missing_name"
  | "bad_range"
  | "bad_time"
  | "empty_window"
  | "bad_interval"
  | "bad_reward";

/**
 * Controleert een periode en geeft de eerste fout terug, of null. Overlap met een
 * andere periode ziet ze niet, want daar zijn de andere periodes voor nodig; dat
 * controleert de actie die opslaat.
 */
export function validateFakPeriod(input: FakPeriodRules & { name: string }): FakPeriodError | null {
  if (!input.name.trim()) return "missing_name";
  if (
    Number.isNaN(input.startsAt.getTime()) ||
    Number.isNaN(input.endsAt.getTime()) ||
    input.endsAt <= input.startsAt
  ) {
    return "bad_range";
  }
  if ((input.windowStart === null) !== (input.windowEnd === null)) return "bad_time";
  if (input.windowStart !== null && input.windowEnd !== null) {
    if (!HHMM.test(input.windowStart) || !HHMM.test(input.windowEnd)) return "bad_time";
    // Zelfde dubbelzinnigheid als bij het dubbeltelvenster: "de klok rond" of
    // "nooit"? Wie de klok rond wil, zet het venster uit.
    if (input.windowStart === input.windowEnd) return "empty_window";
  }
  if (
    !Number.isInteger(input.intervalMinutes) ||
    input.intervalMinutes < FAK_PERIOD_INTERVAL_MIN ||
    input.intervalMinutes > FAK_PERIOD_INTERVAL_MAX
  ) {
    return "bad_interval";
  }
  if (!Number.isInteger(input.rewardEvery) || input.rewardEvery < 1 || input.rewardEvery > 1000) {
    return "bad_reward";
  }
  return null;
}
