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


