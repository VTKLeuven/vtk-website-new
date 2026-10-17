import type { Locale } from "@vtk/i18n";

import { brusselsMinutesOfDay, brusselsYMD } from "@/lib/brussels";
import type { OpeningWindowPhase } from "@/lib/elixir/openingWindow";

/**
 * De openingsuren als tijdvensters, voor de band op de homepage: vandaag als
 * tijdlijn, de week als rooster eronder (zie docs/design-decisions.md).
 *
 * De uren komen binnen als vrije tekst: een redacteur tikt ze in
 * /admin/openingsuren, en de cursusdienst voegt haar vensters samen tot
 * "12:30 – 14:00, 18:00 – 19:00" (`weekToEntries`). `parseHoursRange` in
 * `hoursUtils` leest daar enkel het eerste venster uit, dus stond de cursusdienst
 * 's avonds als gesloten terwijl ze open was. Deze module leest elk venster.
 *
 * **Alles rekent op de klok van Brussel**, niet op die van het proces: de
 * container draait op UTC, en `Date#getHours()` lag daar een of twee uur naast.
 *
 * Bewust vrij van prisma en fetch, zodat het los te testen valt
 * (`test/openingHoursWeek.test.ts`).
 */

const DAY = 24 * 60;
/** Vanaf dit uur heet een opening "vanavond" en niet "vandaag". */
const EVENING = 17 * 60;
/** Een avond zonder sluitingsuur: zo lang het vaste stuk van de balk is. */
const OPEN_END_SOLID = 2 * 60;
/** En zo ver de tijdas daarna nog doorloopt, gearceerd. */
const OPEN_END_TAIL = 5 * 60;

/** Minuten sinds middernacht. `end` mag voorbij 24:00 lopen; `null` is een avond zonder vast sluitingsuur. */
export type HoursWindow = { start: number; end: number | null };

/** Per dag de vensters van één dienst, maandag = 0. */
export type WeekWindows = HoursWindow[][];

const DAY_NAMES_NL = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const DAY_NAMES_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT_NL = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const DAY_SHORT_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Een tijdstip zoals redacteurs het schrijven: 10:30, 10.30, 22u, 22u30, 22h.
 * Een scheidingsteken is verplicht, zodat een los getal in een opmerking geen uur
 * wordt.
 */
const TIME = /(\d{1,2})(?:\s*[:.]\s*(\d{2})|\s*[hu](?:\s*(\d{2}))?)/gi;

function toMinutes(hour: number, minute: number): number | null {
  if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null;
  return hour * 60 + minute;
}

/**
 * Alle vensters uit één dag tekst. "12:30 – 14:00, 18:00 – 19:00" geeft er twee;
 * "22:00" of "22h-..." geeft een venster zonder einde; "Gesloten" geeft niets.
 * Een einde voor het begin loopt over middernacht.
 */
export function parseHoursWindows(hours: string): HoursWindow[] {
  const text = hours.trim();
  if (!text || /gesloten|closed|dicht/i.test(text)) return [];

  const windows: HoursWindow[] = [];
  for (const segment of text.split(/[,;&/]|\s(?:en|and)\s/i)) {
    const times = [...segment.matchAll(TIME)]
      .map((match) => toMinutes(Number(match[1]), Number(match[2] ?? match[3] ?? 0)))
      .filter((minutes): minutes is number => minutes !== null);
    if (times.length === 0) continue;
    const [start, second] = times;
    const end = second === undefined ? null : second <= start ? second + DAY : second;
    windows.push({ start, end });
  }
  return windows.sort((a, b) => a.start - b.start);
}

/** De week uit de `entries` van een instelling of van de cursusdienst. */
export function weekFromEntries(entries: ReadonlyArray<{ dayNl: string; hours: string }>): WeekWindows {
  const week: WeekWindows = Array.from({ length: 7 }, () => []);
  for (const entry of entries) {
    const index = DAY_NAMES_NL.indexOf(entry.dayNl.trim().toLowerCase());
    if (index >= 0) week[index] = parseHoursWindows(entry.hours);
  }
  return week;
}

/** De week van 't ElixIr uit haar openingsuren per dag (`elixirScheduleFromSetting`). */
export function weekFromOpeningTimes(schedule: ReadonlyArray<number | null>): WeekWindows {
  return Array.from({ length: 7 }, (_, day) => {
    const start = schedule[day];
    return start === null || start === undefined ? [] : [{ start, end: null }];
  });
}

export type WeekClock = { weekday: number; minutes: number };

/** Weekdag (maandag = 0) en minuten sinds middernacht, op de klok van Brussel. */
export function brusselsWeekClock(now: Date): WeekClock {
  const { year, month, day } = brusselsYMD(now);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { weekday: js === 0 ? 6 : js - 1, minutes: brusselsMinutesOfDay(now) };
}

export function formatMinutes(minutes: number): string {
  const wrapped = ((minutes % DAY) + DAY) % DAY;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function windowLabel(window: HoursWindow, locale: Locale): string {
  if (window.end === null) return `${locale === "nl" ? "vanaf" : "from"} ${formatMinutes(window.start)}`;
  return `${formatMinutes(window.start)}–${formatMinutes(window.end)}`;
}

export type HoursState = "open" | "closed" | "maybe" | "unavailable";
export type HoursStatus = { state: HoursState; label: string; extra: string | null };

/**
 * Hoeveel dagen vooruit het rooster iets weet. Een instelling herhaalt zich elke
 * week. De cursusdienst geeft één opgehaalde week: deze, of in het weekend de
 * volgende. Daarbuiten "opent maandag" zeggen zou de uren van een andere week
 * raden.
 */
export function knownDaysAhead(clock: WeekClock, recurring: boolean): number {
  if (recurring) return 7;
  const weekend = clock.weekday >= 5;
  return 6 - clock.weekday + (weekend ? 7 : 0);
}

function openingLabel(offset: number, day: number, start: number, locale: Locale): string {
  const time = formatMinutes(start);
  if (locale === "nl") {
    if (offset === 0) return `Opent ${start >= EVENING ? "vanavond" : "vandaag"} om ${time}`;
    if (offset === 1) return `Opent morgen om ${time}`;
    return `Opent ${DAY_NAMES_NL[day]} om ${time}`;
  }
  if (offset === 0) return `Opens ${start >= EVENING ? "tonight" : "today"} at ${time}`;
  if (offset === 1) return `Opens tomorrow at ${time}`;
  return `Opens ${DAY_NAMES_EN[day]} at ${time}`;
}

function nextOpening(week: WeekWindows, clock: WeekClock, horizon: number, locale: Locale): string | null {
  for (let offset = 0; offset <= horizon; offset += 1) {
    const day = (clock.weekday + offset) % 7;
    const next = week[day]?.find((window) => offset > 0 || window.start > clock.minutes);
    if (next) return openingLabel(offset, day, next.start, locale);
  }
  return null;
}

function closedStatus(
  week: WeekWindows,
  clock: WeekClock,
  horizon: number,
  locale: Locale,
  extra: string | null,
): HoursStatus {
  const label = nextOpening(week, clock, horizon, locale) ?? (locale === "nl" ? "Gesloten" : "Closed");
  return { state: "closed", label, extra };
}

/** Een tweede venster later op de dag, zoals de cursusdienst 's avonds. */
function againLabel(window: HoursWindow, locale: Locale): string {
  const evening = window.start >= EVENING;
  const from = formatMinutes(window.start);
  if (locale === "nl") {
    const when = evening ? "Vanavond" : "Later vandaag";
    return window.end === null
      ? `${when} weer open vanaf ${from}`
      : `${when} weer open van ${from} tot ${formatMinutes(window.end)}`;
  }
  const when = evening ? "tonight" : "later today";
  return window.end === null
    ? `Open again ${when} from ${from}`
    : `Open again ${when} from ${from} to ${formatMinutes(window.end)}`;
}

/** Open of niet voor een dienst met vaste vensters (Theokot, cursusdienst). */
export function scheduleStatus(
  week: WeekWindows,
  clock: WeekClock,
  horizon: number,
  locale: Locale,
): HoursStatus {
  const today = week[clock.weekday] ?? [];
  const yesterday = week[(clock.weekday + 6) % 7] ?? [];
  const running =
    today.find((window) => window.end !== null && window.start <= clock.minutes && clock.minutes < window.end) ??
    yesterday.find((window) => window.end !== null && window.end > DAY && clock.minutes + DAY < window.end);

  if (running && running.end !== null) {
    const later = today.find((window) => window.start > clock.minutes && window !== running);
    return {
      state: "open",
      label: `${locale === "nl" ? "Open tot" : "Open until"} ${formatMinutes(running.end)}`,
      extra: later ? againLabel(later, locale) : null,
    };
  }
  return closedStatus(week, clock, horizon, locale, null);
}

/**
 * Wat er van 't ElixIr gekend is: in welk deel van haar venster we zitten
 * (`openingWindowPhase`), en de geluidsmeting wanneer die vers is en binnen dat
 * venster valt.
 */
export type ElixirReading = {
  phase: OpeningWindowPhase;
  live: { isOpen: boolean; measuredAt: Date } | null;
};

/**
 * Open of niet voor 't ElixIr. De meting wint van het rooster; zonder meting is
 * de avond "open" en na middernacht "mogelijk nog open", want het sluitingsuur
 * varieert.
 */
export function elixirStatus(
  week: WeekWindows,
  clock: WeekClock,
  reading: ElixirReading,
  locale: Locale,
): HoursStatus {
  const nl = locale === "nl";
  const measured = reading.live
    ? `${nl ? "Live gemeten om" : "Measured live at"} ${formatMinutes(brusselsMinutesOfDay(reading.live.measuredAt))}`
    : null;
  const openNow = nl ? "Nu open" : "Open now";

  if (reading.live?.isOpen) return { state: "open", label: openNow, extra: measured };
  if (!reading.live && reading.phase === "evening") return { state: "open", label: openNow, extra: null };
  if (!reading.live && reading.phase === "after-midnight") {
    return { state: "maybe", label: nl ? "Mogelijk nog open" : "Possibly still open", extra: null };
  }
  return closedStatus(week, clock, 7, locale, measured);
}

export type TimelineAxis = { start: number; end: number };

/**
 * De tijdas, gedeeld door alle diensten en alle dagen, zodat ze niet verspringt
 * van dag tot dag. Minstens 9:00 tot 19:00; een avond zonder sluitingsuur trekt
 * ze vijf uur voorbij haar begin, dus tot 3:00 voor een opening om 22:00.
 */
export function timelineAxis(weeks: ReadonlyArray<WeekWindows>): TimelineAxis {
  let start = 9 * 60;
  let end = 19 * 60;
  for (const week of weeks) {
    for (const day of week) {
      for (const window of day) {
        start = Math.min(start, Math.floor(window.start / 60) * 60);
        end = Math.max(end, Math.ceil((window.end ?? window.start + OPEN_END_TAIL) / 60) * 60);
      }
    }
  }
  return { start, end: Math.min(end, start + DAY) };
}

/**
 * Welke dag de tijdlijn toont en waar "nu" erop staat. Na middernacht, zolang de
 * as van gisteren nog loopt, is dat gisteren: om 1:30 op woensdag hoort de nacht
 * nog bij dinsdagavond.
 */
export function timelineMoment(axis: TimelineAxis, clock: WeekClock) {
  const overnight = axis.end > DAY && clock.minutes < axis.end - DAY;
  const position = overnight ? clock.minutes + DAY : clock.minutes;
  return {
    day: overnight ? (clock.weekday + 6) % 7 : clock.weekday,
    overnight,
    position,
    visible: position >= axis.start && position <= axis.end,
  };
}

export type TimelineMoment = ReturnType<typeof timelineMoment>;

export type TimelineBar = {
  /** `open-end` is het vaste stuk van een avond zonder sluitingsuur, `tail` de arcering erna. */
  kind: "window" | "open-end" | "tail";
  /** Percentages van de tijdas. */
  left: number;
  width: number;
  label: string | null;
  /** Het venster waarin "nu" valt; dat licht op. */
  active: boolean;
  /** Waar het label komt wanneer het niet in de balk past. */
  side: "after" | "before";
  /** Enkel voor `tail`: of de avond nu loopt, en of dat zeker is. */
  tail?: "open" | "maybe" | "idle";
  /**
   * Het volgende venster begint kort na dit: een label naast de balk zou er op
   * een telefoon tegenaan lopen. Daar staan de uren dan enkel in het rooster.
   */
  crowded?: boolean;
};

/** Zo veel minuten tussen twee vensters heeft een label ernaast nodig op een telefoon. */
const LABEL_ROOM = 270;

export function timelineBars(
  windows: ReadonlyArray<HoursWindow>,
  axis: TimelineAxis,
  moment: TimelineMoment,
  state: HoursState,
  locale: Locale,
): TimelineBar[] {
  const span = axis.end - axis.start;
  const pct = (minutes: number) =>
    ((Math.min(Math.max(minutes, axis.start), axis.end) - axis.start) / span) * 100;
  const bars: TimelineBar[] = [];

  windows.forEach((window, index) => {
    if (window.end === null) {
      // De status geldt enkel voor de avond die nu loopt, niet voor die van
      // vanavond wanneer het nog ochtend is.
      const running = moment.visible && moment.position >= window.start;
      const tail = running && state === "open" ? "open" : running && state === "maybe" ? "maybe" : "idle";
      const solidEnd = Math.min(window.start + OPEN_END_SOLID, axis.end);
      bars.push({
        kind: "open-end",
        left: pct(window.start),
        width: pct(solidEnd) - pct(window.start),
        label: windowLabel(window, locale),
        active: tail === "open",
        side: "before",
      });
      if (solidEnd < axis.end) {
        bars.push({ kind: "tail", left: pct(solidEnd), width: 100 - pct(solidEnd), label: null, active: false, side: "after", tail });
      }
      return;
    }
    const next = windows[index + 1];
    bars.push({
      kind: "window",
      left: pct(window.start),
      width: pct(window.end) - pct(window.start),
      label: windowLabel(window, locale),
      active: moment.visible && window.start <= moment.position && moment.position < window.end,
      side: "after",
      crowded: next !== undefined && next.start - window.end < LABEL_ROOM,
    });
  });
  return bars;
}

export type HoursServiceInput = {
  key: string;
  name: string;
  subtitle: string;
  note: string;
  /** `null`: de uren hadden er moeten zijn en kwamen niet (cudi onbereikbaar, geen cache). */
  week: WeekWindows | null;
  /** Herhaalt zich elke week (een instelling), in plaats van één opgehaalde week. */
  recurring: boolean;
  /** Enkel voor 't ElixIr. */
  elixir?: ElixirReading;
};

export type HoursCell = { day: number; short: string; full: string; today: boolean; lines: string[] };

export type HoursBandService = {
  key: string;
  name: string;
  subtitle: string;
  note: string;
  status: HoursStatus;
  unavailable: boolean;
  bars: TimelineBar[];
  cells: HoursCell[];
};

export type HoursBand = {
  /** Uren op de as, voor de rasterlijnen. */
  hours: number;
  ticks: Array<{ left: number; label: string; minor: boolean }>;
  now: { left: number; label: string } | null;
  dayLabel: string;
  /** Het weekend: de cursusdienst toont dan de uren van volgende week. */
  nextWeek: boolean;
  /** Kolommen van het weekrooster: zondag eerst, zie docs/design-decisions.md. */
  columns: number;
  services: HoursBandService[];
};

export function buildHoursBand(inputs: ReadonlyArray<HoursServiceInput>, now: Date, locale: Locale): HoursBand {
  const nl = locale === "nl";
  const clock = brusselsWeekClock(now);
  const weeks = inputs.flatMap((input) => (input.week ? [input.week] : []));
  const axis = timelineAxis(weeks);
  const moment = timelineMoment(axis, clock);
  const span = axis.end - axis.start;
  const pct = (minutes: number) => ((minutes - axis.start) / span) * 100;

  // Zaterdag krijgt enkel een kolom wanneer er dan iets open is.
  const days = [6, 0, 1, 2, 3, 4, ...(weeks.some((week) => week[5].length > 0) ? [5] : [])];

  const ticks: HoursBand["ticks"] = [];
  for (let minutes = Math.floor(axis.start / 120) * 120 + 120; minutes < axis.end; minutes += 120) {
    ticks.push({ left: pct(minutes), label: formatMinutes(minutes), minor: ticks.length % 2 === 1 });
  }

  const services = inputs.map((input): HoursBandService => {
    const base = { key: input.key, name: input.name, subtitle: input.subtitle, note: input.note };
    if (!input.week) {
      return {
        ...base,
        status: { state: "unavailable", label: nl ? "Uren niet beschikbaar" : "Hours unavailable", extra: null },
        unavailable: true,
        bars: [],
        cells: [],
      };
    }
    const week = input.week;
    const status = input.elixir
      ? elixirStatus(week, clock, input.elixir, locale)
      : scheduleStatus(week, clock, knownDaysAhead(clock, input.recurring), locale);
    return {
      ...base,
      status,
      unavailable: false,
      bars: timelineBars(week[moment.day], axis, moment, status.state, locale),
      cells: days.map((day) => ({
        day,
        short: (nl ? DAY_SHORT_NL : DAY_SHORT_EN)[day],
        full: (nl ? DAY_NAMES_NL : DAY_NAMES_EN)[day],
        today: day === moment.day,
        lines: week[day].map((window) => windowLabel(window, locale)),
      })),
    };
  });

  const dayName = (nl ? DAY_NAMES_NL : DAY_NAMES_EN)[moment.day];
  const dayLabel = moment.overnight
    ? nl
      ? `${dayName}nacht`
      : `${dayName} night`
    : `${nl ? "Vandaag" : "Today"} · ${dayName}`;

  return {
    hours: span / 60,
    ticks,
    now: moment.visible ? { left: pct(moment.position), label: formatMinutes(clock.minutes) } : null,
    dayLabel,
    nextWeek: clock.weekday >= 5,
    columns: days.length,
    services,
  };
}
