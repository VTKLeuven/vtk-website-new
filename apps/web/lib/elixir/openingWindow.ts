/**
 * Het venster waarin 't ElixIr open kan zijn: zondag tot en met donderdag van
 * 22u tot 7u de volgende ochtend.
 *
 * De geluidsmeting mag enkel binnen dit venster iets zeggen. Buiten de uren is
 * de bar dicht, hoe luid het er ook is: een cantus op zaterdagmiddag of een
 * poetsploeg met de radio aan is geen open bar. Het rooster bepaalt dus wanneer
 * de bar open *kan* zijn, de meter bevestigt of ze het *is*.
 *
 * Alles rekent op Brusselse tijd, niet op de tijdzone van het proces: de
 * container draait op UTC en dan zou "vanaf 22u" er in de zomer twee uur naast
 * liggen.
 */

import {
  entriesForService,
  OPENING_HOURS_SERVICE_CONFIG,
  readOpeningHoursSetting,
} from "@/lib/openingHoursSettings";

const TIME_ZONE = "Europe/Brussels";

export const ELIXIR_OPENS_AT_MIN = 22 * 60;
export type OpeningWindowSchedule = ReadonlyArray<number | null>;
export const DEFAULT_ELIXIR_SCHEDULE: OpeningWindowSchedule = [
  ELIXIR_OPENS_AT_MIN,
  ELIXIR_OPENS_AT_MIN,
  ELIXIR_OPENS_AT_MIN,
  ELIXIR_OPENS_AT_MIN,
  null,
  null,
  ELIXIR_OPENS_AT_MIN,
];
export const CLOSED_ELIXIR_SCHEDULE: OpeningWindowSchedule = Array.from({ length: 7 }, () => null);
/**
 * Bovengrens van het venster. Het echte sluitingsuur varieert; 7u is ruim
 * genomen omdat de meter binnen het venster alsnog moet bevestigen. Het is ook
 * het uur waarop Munisense zijn dagevent afsluit.
 */
export const ELIXIR_CLOSES_AT_MIN = 7 * 60;

const WEEKDAY_TO_MONDAY_FIRST: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Weekdag (ma=0) en minuten sinds middernacht, in Brussel. */
function brusselsClock(now: Date): { weekday: number; minutes: number } {
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = WEEKDAY_TO_MONDAY_FIRST[get("weekday")] ?? 0;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return { weekday, minutes };
}

export type OpeningWindowPhase =
  /** Buiten de uren. */
  | "closed"
  /** Vanaf 22u op een openingsdag. */
  | "evening"
  /** Na middernacht, terwijl de avond van gisteren nog kan lopen. */
  | "after-midnight";

export function openingWindowPhase(
  now: Date,
  schedule: OpeningWindowSchedule = CLOSED_ELIXIR_SCHEDULE,
): OpeningWindowPhase {
  const { weekday, minutes } = brusselsClock(now);
  const opensAt = schedule[weekday];
  if (opensAt !== null && opensAt !== undefined && minutes >= opensAt) return "evening";
  const yesterday = (weekday + 6) % 7;
  if (minutes < ELIXIR_CLOSES_AT_MIN && schedule[yesterday] !== null && schedule[yesterday] !== undefined) {
    return "after-midnight";
  }
  return "closed";
}

export function withinOpeningWindow(
  now: Date,
  schedule: OpeningWindowSchedule = CLOSED_ELIXIR_SCHEDULE,
): boolean {
  return openingWindowPhase(now, schedule) !== "closed";
}

/**
 * Bouwt het live-statusvenster uit dezelfde instelling als de publieke kaart.
 * Geen instelling of geen geldig uur betekent gesloten, zonder code-default.
 */
export function elixirScheduleFromSetting(value: unknown): OpeningWindowSchedule {
  const setting = readOpeningHoursSetting(value, "elixir");
  const entries = entriesForService(setting, "elixir", "nl");
  const schedule = [...CLOSED_ELIXIR_SCHEDULE];
  entries.forEach((entry, index) => {
    const match = entry.hours.match(/(?:^|\s)([01]\d|2[0-3]):([0-5]\d)(?:\s|$)/);
    if (!match) return;
    const day = OPENING_HOURS_SERVICE_CONFIG.elixir.days[index];
    if (!day) return;
    schedule[day.mondayIndex] = Number(match[1]) * 60 + Number(match[2]);
  });
  return schedule;
}
