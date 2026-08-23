import type { Locale } from "@vtk/i18n";

export type OpeningHoursService = "theokot" | "cursusdienst" | "elixir";
export type OpeningHoursEntry = { dayNl: string; dayEn: string; hours: string };
export type OpeningHoursSetting = {
  titleNl: string;
  titleEn: string;
  subtitleNl: string;
  subtitleEn: string;
  noteNl: string;
  noteEn: string;
  entries: OpeningHoursEntry[];
};

type DayDefinition = { dayNl: string; dayEn: string; mondayIndex: number };

const MONDAY_TO_FRIDAY: DayDefinition[] = [
  { dayNl: "Maandag", dayEn: "Monday", mondayIndex: 0 },
  { dayNl: "Dinsdag", dayEn: "Tuesday", mondayIndex: 1 },
  { dayNl: "Woensdag", dayEn: "Wednesday", mondayIndex: 2 },
  { dayNl: "Donderdag", dayEn: "Thursday", mondayIndex: 3 },
  { dayNl: "Vrijdag", dayEn: "Friday", mondayIndex: 4 },
];

const ELIXIR_DAYS: DayDefinition[] = [
  { dayNl: "Zondag", dayEn: "Sunday", mondayIndex: 6 },
  ...MONDAY_TO_FRIDAY.slice(0, 4),
];

export const OPENING_HOURS_SERVICE_CONFIG = {
  theokot: {
    groupCode: "THEOKOT",
    settingKey: "home.openingHours.theokot",
    titleNl: "Openingsuren Theokot",
    titleEn: "Theokot opening hours",
    subtitleNl: "Broodjes & warme snacks",
    subtitleEn: "Sandwiches & snacks",
    days: MONDAY_TO_FRIDAY,
  },
  cursusdienst: {
    groupCode: "CURSUSDIENST",
    settingKey: "home.openingHours.cursusdienst",
    titleNl: "Openingsuren Cursusdienst",
    titleEn: "Course Shop opening hours",
    subtitleNl: "Cursussen & tweedehands",
    subtitleEn: "Courses & second-hand",
    days: MONDAY_TO_FRIDAY,
  },
  elixir: {
    groupCode: "FAKBAR",
    settingKey: "home.openingHours.elixir",
    titleNl: "'t ElixIr",
    titleEn: "'t ElixIr",
    subtitleNl: "Faculteitsbar Ingenieurswetenschappen",
    subtitleEn: "Faculty Bar Engineering Science",
    days: ELIXIR_DAYS,
  },
} satisfies Record<OpeningHoursService, {
  groupCode: string;
  settingKey: string;
  titleNl: string;
  titleEn: string;
  subtitleNl: string;
  subtitleEn: string;
  days: DayDefinition[];
}>;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function rawEntries(value: unknown): OpeningHoursEntry[] {
  const source = record(value).entries;
  if (!Array.isArray(source)) return [];
  return source.flatMap((item): OpeningHoursEntry[] => {
    const row = record(item);
    if (typeof row.hours !== "string") return [];
    return [{
      dayNl: text(row.dayNl),
      dayEn: text(row.dayEn),
      hours: row.hours.trim(),
    }];
  });
}

/** Leest redactionele velden defensief; ontbrekende roosterdata blijft leeg. */
export function readOpeningHoursSetting(
  value: unknown,
  service: OpeningHoursService,
): OpeningHoursSetting {
  const source = record(value);
  const defaults = OPENING_HOURS_SERVICE_CONFIG[service];
  return {
    titleNl: text(source.titleNl) || defaults.titleNl,
    titleEn: text(source.titleEn) || defaults.titleEn,
    subtitleNl: text(source.subtitleNl) || defaults.subtitleNl,
    subtitleEn: text(source.subtitleEn) || defaults.subtitleEn,
    noteNl: text(source.noteNl),
    noteEn: text(source.noteEn),
    entries: rawEntries(source),
  };
}

function rowForDay(entries: OpeningHoursEntry[], day: DayDefinition, index: number) {
  const exact = entries.find((entry) =>
    entry.dayNl.toLocaleLowerCase("nl-BE") === day.dayNl.toLocaleLowerCase("nl-BE") ||
    entry.dayEn.toLocaleLowerCase("en-GB") === day.dayEn.toLocaleLowerCase("en-GB")
  );
  return exact ?? entries[index];
}

/** Vast aantal relevante dagen per post; ontbrekende waarden zijn gesloten. */
export function entriesForService(
  setting: OpeningHoursSetting,
  service: OpeningHoursService,
  locale: Locale,
): OpeningHoursEntry[] {
  const closed = locale === "nl" ? "Gesloten" : "Closed";
  return OPENING_HOURS_SERVICE_CONFIG[service].days.map((day, index) => {
    const source = rowForDay(setting.entries, day, index);
    const rawHours = source?.hours.trim() ?? "";
    return {
      dayNl: day.dayNl,
      dayEn: day.dayEn,
      hours: !rawHours || /^(gesloten|closed|dicht|—|-)$/.test(rawHours.toLocaleLowerCase())
        ? closed
        : rawHours,
    };
  });
}

export function openingHoursNote(setting: OpeningHoursSetting, locale: Locale): string {
  return locale === "nl" ? setting.noteNl : setting.noteEn || setting.noteNl;
}

export function isBrusselsWeekend(now: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
  }).format(now);
  return weekday === "Sat" || weekday === "Sun";
}
