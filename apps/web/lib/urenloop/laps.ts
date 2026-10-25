/**
 * De rondes van de 24 urenloop per loper: `laps.csv` uit de export van de
 * telapp inlezen, en daaruit de cijfers van één loper berekenen.
 *
 * Puur, zonder database: de upload in /admin/24urenloop en het account lezen
 * allebei hierlangs, en de tests ook.
 */

import { normalizeRNumber } from "@/lib/theokotPickupQuery";

/**
 * Lengte van één ronde. De speedyteam-test in dezelfde export is één ronde
 * (`test_distance_m` 530), en de data-analyse (24UL-data-analysis,
 * `LAP_DISTANCE_M`) rekent met hetzelfde getal.
 */
export const URENLOOP_LAP_METERS = 530;

/** Sleutel van een noodronde die niemand kon toewijzen; telt enkel voor de ploeg. */
export const UNKNOWN_RUNNER = "unknown";

export type ParsedLap = {
  sequence: number;
  runnerKey: string;
  rNumber: string | null;
  startedAt: Date;
  endedAt: Date;
  timeMs: number;
  raining: boolean;
  source: string;
};

export type ParsedLapsFile = {
  year: number;
  eventStart: Date;
  laps: ParsedLap[];
};

export type LapsCsvError =
  | "EMPTY_FILE"
  | "NOT_LAPS_CSV"
  | "INVALID_ROW"
  | "MIXED_YEARS"
  | "DUPLICATE_LAP";

/**
 * Wat de upload uit `laps.csv` leest. Dit is ook de beschrijving van het
 * formaat op /admin/24urenloop, voor het geval de README van de export ooit
 * zoek is: de parser en die uitleg lezen dezelfde lijst, dus ze lopen niet
 * uiteen. Andere kolommen (`team`, `runner_name`, `lap_id`, ...) worden
 * genegeerd.
 */
export const LAPS_CSV_COLUMNS: ReadonlyArray<{
  name: string;
  required: boolean;
  example: string;
  nl: string;
  en: string;
}> = [
  {
    name: "event_year",
    required: true,
    example: "2026",
    nl: "Jaar van de editie. Eén jaar per bestand.",
    en: "Year of the edition. One year per file.",
  },
  {
    name: "lap_sequence",
    required: true,
    example: "1",
    nl: "Ploegronde, vanaf 1. Uniek in het bestand.",
    en: "Team lap, from 1. Unique within the file.",
  },
  {
    name: "runner_id",
    required: true,
    example: "r0123456",
    nl: "Wie liep: het r-nummer, of een vaste sleutel per loper zonder r-nummer (de export gebruikt name_ plus een hash). unknown voor een noodronde die niemand kon toewijzen.",
    en: "Who ran: the r-number, or a fixed key per runner without one (the export uses name_ plus a hash). unknown for an emergency lap nobody could assign.",
  },
  {
    name: "r_number",
    required: true,
    example: "r0123456",
    nl: "Het r-nummer (r of u en zeven cijfers), leeg zonder. Hierop koppelt de ronde aan een account.",
    en: "The r-number (r or u and seven digits), empty when there is none. This links the lap to an account.",
  },
  {
    name: "lap_start_utc",
    required: true,
    example: "2026-10-20T18:00:02.809Z",
    nl: "Start van de ronde, ISO 8601 in UTC.",
    en: "Start of the lap, ISO 8601 in UTC.",
  },
  {
    name: "lap_end_utc",
    required: true,
    example: "2026-10-20T18:01:23.269Z",
    nl: "Einde van de ronde, ISO 8601 in UTC.",
    en: "End of the lap, ISO 8601 in UTC.",
  },
  {
    name: "lap_time_seconds",
    required: true,
    example: "80.46",
    nl: "Rondetijd in seconden, met een punt als decimaalteken, na correcties.",
    en: "Lap time in seconds, with a dot as decimal separator, after corrections.",
  },
  {
    name: "event_start_utc",
    required: false,
    example: "2026-10-20T18:00:02.809Z",
    nl: "Start van de race, het nulpunt voor het uur van de race. Zonder: de start van de eerste ronde.",
    en: "Start of the race, the zero point for the race hour. Without it: the start of the first lap.",
  },
  {
    name: "raining",
    required: false,
    example: "false",
    nl: "true wanneer het regende. Zonder: false.",
    en: "true when it was raining. Without it: false.",
  },
  {
    name: "source",
    required: false,
    example: "manual",
    nl: "Hoe de ronde geteld werd: manual, camera of emergency. Zonder: manual.",
    en: "How the lap was counted: manual, camera or emergency. Without it: manual.",
  },
];

const REQUIRED_COLUMNS = LAPS_CSV_COLUMNS.filter((c) => c.required).map((c) => c.name);

/**
 * Splitst CSV in rijen en velden, met aanhalingstekens zoals RFC 4180. De
 * export zet er vandaag geen, maar een naam met een komma zou ze krijgen.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

/**
 * Leest `laps.csv`. Een fout geeft de regel terug (1 = de kop), zodat de
 * melding in de admin kan zeggen waar het misliep.
 */
export function parseLapsCsv(
  text: string,
): { ok: true; file: ParsedLapsFile } | { ok: false; code: LapsCsvError; line?: number } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, code: "EMPTY_FILE" };

  const header = rows[0].map((h) => h.trim());
  const col = new Map(header.map((name, index) => [name, index]));
  if (REQUIRED_COLUMNS.some((name) => !col.has(name))) {
    return { ok: false, code: "NOT_LAPS_CSV" };
  }
  const get = (row: string[], name: string) => {
    const index = col.get(name);
    return index === undefined ? undefined : row[index]?.trim();
  };

  // Een loper zonder r-nummer krijgt in de export een hash van zijn naam. Die
  // bewaren we niet (zie `UrenloopLap`), maar groeperen wel: zelfde hash, zelfde
  // `anon-<n>` binnen deze upload.
  const anonymous = new Map<string, string>();
  const seen = new Set<number>();
  const laps: ParsedLap[] = [];
  let year: number | null = null;
  let eventStart: Date | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;

    const rowYear = Number(get(row, "event_year"));
    const sequence = Number(get(row, "lap_sequence"));
    const startedAt = parseDate(get(row, "lap_start_utc"));
    const endedAt = parseDate(get(row, "lap_end_utc"));
    const seconds = Number(get(row, "lap_time_seconds"));
    const runnerId = get(row, "runner_id") ?? "";
    if (
      !Number.isInteger(rowYear) ||
      rowYear < 1990 ||
      rowYear > 2200 ||
      !Number.isInteger(sequence) ||
      sequence < 1 ||
      !startedAt ||
      !endedAt ||
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      runnerId === ""
    ) {
      return { ok: false, code: "INVALID_ROW", line };
    }

    if (year === null) year = rowYear;
    else if (year !== rowYear) return { ok: false, code: "MIXED_YEARS", line };
    if (seen.has(sequence)) return { ok: false, code: "DUPLICATE_LAP", line };
    seen.add(sequence);

    const rNumber = normalizeRNumber(get(row, "r_number") ?? "");
    let runnerKey: string;
    if (rNumber) {
      runnerKey = rNumber;
    } else if (runnerId === UNKNOWN_RUNNER) {
      runnerKey = UNKNOWN_RUNNER;
    } else {
      runnerKey = anonymous.get(runnerId) ?? `anon-${anonymous.size + 1}`;
      anonymous.set(runnerId, runnerKey);
    }

    const rowEventStart = parseDate(get(row, "event_start_utc"));
    if (rowEventStart && !eventStart) eventStart = rowEventStart;

    laps.push({
      sequence,
      runnerKey,
      rNumber,
      startedAt,
      endedAt,
      timeMs: Math.round(seconds * 1000),
      raining: get(row, "raining")?.toLowerCase() === "true",
      source: get(row, "source") || "manual",
    });
  }

  if (year === null) return { ok: false, code: "EMPTY_FILE" };
  const firstStart = laps.reduce(
    (min, lap) => (lap.startedAt < min ? lap.startedAt : min),
    laps[0].startedAt,
  );
  return { ok: true, file: { year, eventStart: eventStart ?? firstStart, laps } };
}

export type RunnerLap = {
  sequence: number;
  startedAt: Date;
  timeMs: number;
  raining: boolean;
  source: string;
};

/** Eén loper uit de ploeg, voor de rangschikking. */
export type FieldEntry = { runnerKey: string; laps: number; bestMs: number };

export type RunnerYearStats = {
  year: number;
  eventStart: Date;
  /** Op starttijd, de eerste eerst. */
  laps: RunnerLap[];
  lapCount: number;
  bestMs: number;
  /** Ploegronde van de snelste ronde, om ze in de lijst aan te duiden. */
  bestSequence: number;
  averageMs: number;
  slowestMs: number;
  /** Opgeteld: zo lang liep je in totaal. */
  totalMs: number;
  distanceKm: number;
  /** Plaats op aantal rondes; ex aequo deelt een plaats. */
  lapsRank: number;
  /** Plaats op snelste ronde. */
  bestRank: number;
  /** Lopers met minstens één ronde, zonder de noodrondes van niemand. */
  runners: number;
  teamLaps: number;
};

/**
 * De cijfers van één loper in één jaar. `field` is elke loper van dat jaar
 * (ook de loper zelf), zodat de plaats ex aequo kan delen: wie evenveel rondes
 * heeft, staat op dezelfde plaats.
 */
export function summarizeRunner({
  year,
  eventStart,
  laps,
  field,
  teamLaps,
}: {
  year: number;
  eventStart: Date;
  laps: RunnerLap[];
  field: FieldEntry[];
  teamLaps: number;
}): RunnerYearStats | null {
  if (laps.length === 0) return null;
  const sorted = [...laps].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const best = sorted.reduce((min, lap) => (lap.timeMs < min.timeMs ? lap : min), sorted[0]);
  const totalMs = sorted.reduce((sum, lap) => sum + lap.timeMs, 0);
  const runners = field.filter((entry) => entry.runnerKey !== UNKNOWN_RUNNER);

  return {
    year,
    eventStart,
    laps: sorted,
    lapCount: sorted.length,
    bestMs: best.timeMs,
    bestSequence: best.sequence,
    averageMs: Math.round(totalMs / sorted.length),
    slowestMs: Math.max(...sorted.map((lap) => lap.timeMs)),
    totalMs,
    distanceKm: (sorted.length * URENLOOP_LAP_METERS) / 1000,
    lapsRank: 1 + runners.filter((entry) => entry.laps > sorted.length).length,
    bestRank: 1 + runners.filter((entry) => entry.bestMs < best.timeMs).length,
    runners: runners.length,
    teamLaps,
  };
}

/** Rondetijd zoals de telapp ze toont: "1:08.42". */
export function formatLapTime(ms: number): string {
  const hundredths = Math.round(ms / 10);
  const minutes = Math.floor(hundredths / 6000);
  const seconds = Math.floor((hundredths % 6000) / 100);
  const rest = hundredths % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(rest).padStart(2, "0")}`;
}

/** Totale looptijd: "34 min 12 s" of "1 u 04 min". */
export function formatDuration(ms: number, nl: boolean): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} ${nl ? "u" : "h"} ${String(minutes).padStart(2, "0")} min`;
  return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
}

/** Het uur van de race waarin een ronde startte: 1 tot en met 24. */
export function raceHour(startedAt: Date, eventStart: Date): number {
  return Math.floor((startedAt.getTime() - eventStart.getTime()) / 3_600_000) + 1;
}

/**
 * Verzonnen loper voor de voorvertoning op /admin/it/flows: drie shiften van
 * zes rondes, en een ploeg van 380. Geen echte loper, want die pagina is geen
 * plek om andermans rondes te bekijken.
 */
export function sampleRunnerStats(): RunnerYearStats {
  const eventStart = new Date("2026-10-20T18:00:00.000Z");
  const shifts = [2, 9, 19];
  const laps: RunnerLap[] = shifts.flatMap((hour, shift) =>
    Array.from({ length: 6 }, (_, i) => {
      const timeMs = 74_000 + ((i * 7 + shift * 5) % 11) * 1_150 + shift * 1_800;
      return {
        sequence: hour * 46 + i * 9 + 1,
        startedAt: new Date(eventStart.getTime() + hour * 3_600_000 + i * 540_000),
        timeMs,
        raining: shift === 1,
        source: "manual",
      };
    }),
  );
  const field: FieldEntry[] = Array.from({ length: 380 }, (_, i) => ({
    runnerKey: `sample-${i}`,
    laps: 1 + ((i * 7) % 23),
    bestMs: 64_000 + ((i * 37) % 300) * 100,
  }));
  return summarizeRunner({ year: 2026, eventStart, laps, field, teamLaps: 1104 })!;
}
