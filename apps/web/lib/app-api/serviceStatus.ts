import "server-only";

import { pick } from "@vtk/i18n";

import { brusselsMinutesOfDay } from "@/lib/brussels";
import {
  entriesForService,
  openingHoursNote,
  readOpeningHoursSetting,
  type OpeningHoursEntry,
  type OpeningHoursService,
} from "@/lib/openingHoursSettings";
import {
  DUTCH_FULL_DAYS,
  entryForDate,
  mondayFirstWeekdayIndex,
} from "@/components/editorial/hoursUtils";
import { parseHoursWindows, type HoursWindow } from "@/lib/openingHoursWeek";
import type { AppLocale, AppServiceStatus } from "./contract";

/**
 * De drie diensten, herleid tot wat er op één regel past.
 *
 * De site zet een volledig weekrooster naast elkaar en laat de bezoeker zelf
 * kijken. Op een telefoon is de vraag bijna altijd "kan ik er nu heen", en dat is
 * niet hetzelfde als "welke uren staan er". Daarom rekent deze module het uit:
 * open of niet, en één regel die zegt hoe lang nog of wanneer weer.
 *
 * **De klok is die van Brussel en niet die van de server.** De uren staan in
 * wandkloktijd; `isOpenAt` in `hoursUtils` rekent met `Date#getHours()` en dus
 * met de tijdzone van het proces. Dat klopt zolang de server op Brussel staat en
 * is stil fout zodra dat niet zo is. Hier gaat het via `brusselsMinutesOfDay`,
 * zodat het antwoord niet afhangt van hoe de container geconfigureerd staat.
 */

const ENGLISH_FULL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** De naam zonder "Openingsuren " ervoor; de app zet die kop er zelf boven. */
function serviceName(title: string): string {
  return title.replace(/^Openingsuren\s+/i, "").replace(/\s+opening hours$/i, "");
}

function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function dayLabel(entry: OpeningHoursEntry, locale: AppLocale): string {
  return locale === "en" ? entry.dayEn : entry.dayNl;
}

/**
 * De vensters van een dag, als minuten sinds middernacht.
 *
 * Drie vormen komen in de databank voor, en het verschil is geen slordigheid:
 *
 * - **Een bereik** (`12:00 - 14:00`) bij het Theokot.
 * - **Twee bereiken** (`12:30 – 14:00, 18:00 – 19:00`) bij de cursusdienst, die
 *   's middags en 's avonds opengaat.
 * - **Eén tijdstip** (`22:00`) bij 't ElixIr. Een fakbar opent om tien uur en
 *   sluit wanneer ze sluit; er staat met opzet geen einduur (`end: null`).
 *
 * `parseHoursWindows` is dezelfde lezer als de band op de homepage. Vroeger
 * stond hier `parseHoursRange`, dat enkel het eerste venster kent: dan stond de
 * cursusdienst 's avonds als gesloten terwijl ze open was.
 */
function dayWindows(hours: string | undefined): HoursWindow[] {
  return hours ? parseHoursWindows(hours) : [];
}

/**
 * De eerstvolgende dag met uren, binnen een week. Geeft `null` wanneer er in het
 * hele rooster niets openstaat: dan is "gesloten" het volledige antwoord en zou
 * "opent nooit" alleen maar vragen oproepen.
 */
function nextOpening(
  entries: OpeningHoursEntry[],
  now: Date,
  locale: AppLocale,
): { label: string; sameDay: boolean } | null {
  const todayIndex = mondayFirstWeekdayIndex(new Date(brusselsDayAnchor(now)));

  for (let offset = 0; offset < 7; offset += 1) {
    const index = (todayIndex + offset) % 7;
    const nl = DUTCH_FULL_DAYS[index];
    const en = ENGLISH_FULL_DAYS[index];
    const entry = entries.find((candidate) =>
      locale === "en"
        ? candidate.dayEn === en || candidate.dayEn.toLowerCase().includes(en.slice(0, 3).toLowerCase())
        : candidate.dayNl === nl || candidate.dayNl.toLowerCase().includes(nl.slice(0, 3).toLowerCase()),
    );
    if (!entry) continue;
    // Vandaag telt enkel een venster dat nog moet komen; zo zegt de cursusdienst
    // na de middag "opent 18:00" en niet "morgen".
    const minutes = brusselsMinutesOfDay(now);
    const next = dayWindows(entry.hours).find((window) => offset > 0 || window.start > minutes);
    if (!next) continue;

    if (offset === 0) {
      return { label: locale === "en" ? `opens ${formatMinutes(next.start)}` : `opent ${formatMinutes(next.start)}`, sameDay: true };
    }
    const day = dayLabel(entry, locale).slice(0, locale === "en" ? 3 : 2).toLowerCase();
    return { label: `${day} ${formatMinutes(next.start)}`, sameDay: false };
  }

  return null;
}

/**
 * Middernacht in Brussel als instant, zodat de weekdag van "vandaag" niet
 * verschuift wanneer de server in een andere zone staat.
 */
function brusselsDayAnchor(now: Date): number {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // Middag en niet middernacht: zo kan geen enkele zomertijdsprong een dag
  // opschuiven. Dezelfde reden als in `monthGrid.ts` in de app.
  return Date.parse(`${formatted}T12:00:00.000Z`);
}

export type ServiceInput = {
  key: AppServiceStatus["key"];
  service: OpeningHoursService;
  setting: unknown;
  /** Enkel voor de cursusdienst: haar uren komen live van cudi.vtk.be. */
  liveEntries?: OpeningHoursEntry[] | null;
  /** Enkel voor 't ElixIr: de geluidsmeting, wanneer die vers is. */
  measuredOpen?: boolean | null;
};

export function serviceStatus(
  { key, service, setting, liveEntries, measuredOpen }: ServiceInput,
  locale: AppLocale,
  now: Date,
): AppServiceStatus {
  const parsed = readOpeningHoursSetting(setting, service);
  const name = serviceName(pick(parsed.titleNl, parsed.titleEn, locale));
  const note = openingHoursNote(parsed, locale);

  // `liveEntries === null` betekent: we hadden ze moeten hebben en kregen ze
  // niet. Een leeg rooster tonen zou als "altijd gesloten" lezen.
  if (liveEntries === null) {
    return { key, name, openNow: false, detail: locale === "en" ? "Hours unavailable" : "Uren niet beschikbaar", live: false, unavailable: true, entries: [], note };
  }

  const entries = liveEntries ?? entriesForService(parsed, service, locale);
  const anchor = brusselsDayAnchor(now);
  const todayWindows = dayWindows(entryForDate(entries, new Date(anchor), locale)?.hours);
  const yesterdayWindows = dayWindows(
    entryForDate(entries, new Date(anchor - 24 * 60 * 60 * 1000), locale)?.hours,
  );
  const minutes = brusselsMinutesOfDay(now);
  // Het venster waarin "nu" valt: een van vandaag, of een van gisteren dat over
  // middernacht loopt. Een avond zonder einduur geldt tot middernacht; wat de
  // fakbar daarna doet, zegt de meting.
  const running =
    todayWindows.find(
      (window) => minutes >= window.start && (window.end === null || minutes < window.end),
    ) ??
    yesterdayWindows.find((window) => window.end !== null && window.end > 24 * 60 && minutes + 24 * 60 < window.end);
  const scheduledOpen = Boolean(running);

  // De meting wint van het rooster, maar enkel wanneer ze vers is; de aanroeper
  // geeft `null` door zodra ze dat niet meer is. Een verouderde "open" is erger
  // dan geen antwoord.
  const openNow = measuredOpen ?? scheduledOpen;
  const live = measuredOpen !== null && measuredOpen !== undefined;

  let detail: string;
  if (openNow && running && running.end !== null) {
    detail = locale === "en" ? `until ${formatMinutes(running.end)}` : `tot ${formatMinutes(running.end)}`;
  } else if (openNow) {
    // Twee gevallen komen hier samen uit, en geen van beide kent een sluitingsuur:
    // een dag zonder einduur (de fakbar), en live open buiten het rooster. In het
    // tweede geval is het einduur van vandaag al gepasseerd, dus "tot 14:00" zou
    // pertinent onwaar zijn; wat we wél weten is dat er nu volk zit.
    detail = locale === "en" ? "open now" : "nu open";
  } else {
    const next = nextOpening(entries, now, locale);
    detail = next ? next.label : locale === "en" ? "closed" : "gesloten";
  }

  return {
    key,
    name,
    openNow,
    detail,
    live,
    unavailable: false,
    entries: entries.map((entry) => ({ day: dayLabel(entry, locale), hours: entry.hours })),
    note,
    today: todayWindows.map((window) => ({ start: window.start, end: window.end })),
  };
}
