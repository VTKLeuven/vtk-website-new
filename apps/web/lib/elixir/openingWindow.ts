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

const TIME_ZONE = "Europe/Brussels";

/** Openingsdagen, maandag-eerst (ma=0 ... zo=6): zo, ma, di, wo, do. */
export const ELIXIR_OPEN_DAYS = [0, 1, 2, 3, 6];
export const ELIXIR_OPENS_AT_MIN = 22 * 60;
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

export function openingWindowPhase(now: Date): OpeningWindowPhase {
  const { weekday, minutes } = brusselsClock(now);
  if (ELIXIR_OPEN_DAYS.includes(weekday) && minutes >= ELIXIR_OPENS_AT_MIN) return "evening";
  const yesterday = (weekday + 6) % 7;
  if (minutes < ELIXIR_CLOSES_AT_MIN && ELIXIR_OPEN_DAYS.includes(yesterday)) return "after-midnight";
  return "closed";
}

export function withinOpeningWindow(now: Date): boolean {
  return openingWindowPhase(now) !== "closed";
}
