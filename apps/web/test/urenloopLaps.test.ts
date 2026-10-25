import { describe, expect, it } from "vitest";
import {
  LAPS_CSV_COLUMNS,
  formatLapTime,
  parseCsv,
  parseLapsCsv,
  raceHour,
  sampleRunnerStats,
  summarizeRunner,
  type RunnerLap,
} from "@/lib/urenloop/laps";

const HEADER =
  "event_year,team,lap_sequence,runner_id,app_runner_id,runner_name,r_number,lap_id,lap_start_utc,lap_end_utc,lap_time_seconds,event_start_utc,event_elapsed_seconds,event_hour,raining,source";

function row(
  sequence: number,
  runnerId: string,
  rNumber: string,
  start: string,
  end: string,
  seconds: number,
  extra: { year?: number; raining?: boolean; source?: string } = {},
) {
  return [
    extra.year ?? 2026,
    "VTK",
    sequence,
    runnerId,
    sequence,
    "Loper Een",
    rNumber,
    sequence,
    start,
    end,
    seconds,
    "2026-10-20T18:00:02.809Z",
    0,
    0,
    extra.raining ? "true" : "false",
    extra.source ?? "manual",
  ].join(",");
}

const SAMPLE = [
  HEADER,
  row(1, "r0123456", "r0123456", "2026-10-20T18:00:02.809Z", "2026-10-20T18:01:23.269Z", 80.46),
  row(2, "name_abcdef123456", "", "2026-10-20T18:01:23.277Z", "2026-10-20T18:02:29.307Z", 66.03),
  row(3, "unknown", "", "2026-10-20T18:02:29.307Z", "2026-10-20T18:03:40.177Z", 70.87, {
    source: "emergency",
  }),
  row(4, "name_abcdef123456", "", "2026-10-20T18:03:40.177Z", "2026-10-20T18:04:50.000Z", 69.82),
  row(5, "name_999999999999", "", "2026-10-20T18:04:50.000Z", "2026-10-20T18:06:00.000Z", 70, {
    raining: true,
  }),
].join("\n");

describe("parseLapsCsv", () => {
  it("reads laps, keeps r-numbers and anonymises name hashes", () => {
    const result = parseLapsCsv(SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { year, eventStart, laps } = result.file;
    expect(year).toBe(2026);
    expect(eventStart.toISOString()).toBe("2026-10-20T18:00:02.809Z");
    expect(laps).toHaveLength(5);
    expect(laps[0]).toMatchObject({ sequence: 1, runnerKey: "r0123456", rNumber: "r0123456", timeMs: 80460 });
    // Zelfde naam-hash, zelfde anonieme sleutel; de hash zelf wordt niet bewaard.
    expect(laps[1].runnerKey).toBe("anon-1");
    expect(laps[3].runnerKey).toBe("anon-1");
    expect(laps[4].runnerKey).toBe("anon-2");
    expect(laps.some((lap) => lap.runnerKey.includes("abcdef"))).toBe(false);
    expect(laps[2]).toMatchObject({ runnerKey: "unknown", rNumber: null, source: "emergency" });
    expect(laps[4].raining).toBe(true);
  });

  it("accepts a BOM and CRLF line endings", () => {
    const result = parseLapsCsv(`﻿${SAMPLE.replace(/\n/g, "\r\n")}\r\n`);
    expect(result.ok && result.file.laps.length).toBe(5);
  });

  it("refuses another file from the export", () => {
    expect(parseLapsCsv("runner_id,app_runner_id,runner_name\nr1,1,X")).toEqual({
      ok: false,
      code: "NOT_LAPS_CSV",
    });
  });

  it("refuses an empty file", () => {
    expect(parseLapsCsv(HEADER)).toEqual({ ok: false, code: "EMPTY_FILE" });
  });

  it("names the line of a broken row", () => {
    const broken = [HEADER, row(1, "r0123456", "r0123456", "gisteren", "x", 80)].join("\n");
    expect(parseLapsCsv(broken)).toEqual({ ok: false, code: "INVALID_ROW", line: 2 });
  });

  it("refuses two years in one file and a duplicate team lap", () => {
    const mixed = [
      HEADER,
      row(1, "r0123456", "r0123456", "2026-10-20T18:00:00Z", "2026-10-20T18:01:00Z", 60),
      row(2, "r0123456", "r0123456", "2026-10-20T18:01:00Z", "2026-10-20T18:02:00Z", 60, { year: 2025 }),
    ].join("\n");
    expect(parseLapsCsv(mixed)).toEqual({ ok: false, code: "MIXED_YEARS", line: 3 });

    const duplicate = [
      HEADER,
      row(1, "r0123456", "r0123456", "2026-10-20T18:00:00Z", "2026-10-20T18:01:00Z", 60),
      row(1, "r0123456", "r0123456", "2026-10-20T18:01:00Z", "2026-10-20T18:02:00Z", 60),
    ].join("\n");
    expect(parseLapsCsv(duplicate)).toEqual({ ok: false, code: "DUPLICATE_LAP", line: 3 });
  });
});

describe("LAPS_CSV_COLUMNS", () => {
  // De beschrijving op /admin/24urenloop toont deze voorbeelden als het
  // kleinste geldige bestand; dat moet dan ook echt inleesbaar zijn.
  it("describes a file the parser accepts", () => {
    const required = LAPS_CSV_COLUMNS.filter((c) => c.required);
    const minimal = [required.map((c) => c.name).join(","), required.map((c) => c.example).join(",")].join("\n");
    expect(parseLapsCsv(minimal).ok).toBe(true);

    const all = [
      LAPS_CSV_COLUMNS.map((c) => c.name).join(","),
      LAPS_CSV_COLUMNS.map((c) => c.example).join(","),
    ].join("\n");
    const result = parseLapsCsv(all);
    expect(result.ok && result.file.laps[0]).toMatchObject({ rNumber: "r0123456", timeMs: 80460, source: "manual" });
  });

  it("treats every required column as required", () => {
    for (const column of LAPS_CSV_COLUMNS.filter((c) => c.required)) {
      const others = LAPS_CSV_COLUMNS.filter((c) => c.required && c !== column);
      const csv = [others.map((c) => c.name).join(","), others.map((c) => c.example).join(",")].join("\n");
      expect(parseLapsCsv(csv)).toEqual({ ok: false, code: "NOT_LAPS_CSV" });
    }
  });
});

describe("parseCsv", () => {
  it("handles quoted fields with commas and quotes", () => {
    expect(parseCsv('a,b\n"Peeters, Jan","zei ""hoi"""\n')).toEqual([
      ["a", "b"],
      ["Peeters, Jan", 'zei "hoi"'],
    ]);
  });
});

describe("summarizeRunner", () => {
  const eventStart = new Date("2026-10-20T18:00:00Z");
  const lap = (sequence: number, minutes: number, timeMs: number): RunnerLap => ({
    sequence,
    startedAt: new Date(eventStart.getTime() + minutes * 60_000),
    timeMs,
    raining: false,
    source: "manual",
  });

  it("computes count, best, average, ranks and share", () => {
    const stats = summarizeRunner({
      year: 2026,
      eventStart,
      // Bewust niet op volgorde: de lijst sorteert op starttijd.
      laps: [lap(30, 200, 72_000), lap(3, 5, 70_000), lap(10, 60, 80_000)],
      field: [
        { runnerKey: "r0123456", laps: 3, bestMs: 70_000 },
        { runnerKey: "r1111111", laps: 5, bestMs: 65_000 },
        { runnerKey: "anon-1", laps: 3, bestMs: 75_000 },
        { runnerKey: "r2222222", laps: 1, bestMs: 69_000 },
        // Noodrondes van niemand tellen niet als loper.
        { runnerKey: "unknown", laps: 9, bestMs: 50_000 },
      ],
      teamLaps: 21,
    });
    expect(stats).not.toBeNull();
    expect(stats!.laps.map((l) => l.sequence)).toEqual([3, 10, 30]);
    expect(stats!.lapCount).toBe(3);
    expect(stats!.bestMs).toBe(70_000);
    expect(stats!.bestSequence).toBe(3);
    expect(stats!.averageMs).toBe(74_000);
    expect(stats!.slowestMs).toBe(80_000);
    expect(stats!.totalMs).toBe(222_000);
    expect(stats!.distanceKm).toBeCloseTo(1.59);
    // Ex aequo met anon-1: beide op plaats 2.
    expect(stats!.lapsRank).toBe(2);
    expect(stats!.bestRank).toBe(3);
    expect(stats!.runners).toBe(4);
    expect(stats!.teamLaps).toBe(21);
  });

  it("returns null without laps", () => {
    expect(summarizeRunner({ year: 2026, eventStart, laps: [], field: [], teamLaps: 0 })).toBeNull();
  });

  it("builds a sample for the flows preview", () => {
    const sample = sampleRunnerStats();
    expect(sample.lapCount).toBe(18);
    expect(sample.runners).toBe(380);
  });
});

describe("formatting", () => {
  it("formats a lap time like the lap-counting app", () => {
    expect(formatLapTime(68_420)).toBe("1:08.42");
    expect(formatLapTime(59_999)).toBe("1:00.00");
    expect(formatLapTime(125_050)).toBe("2:05.05");
  });

  it("counts race hours from 1", () => {
    const start = new Date("2026-10-20T18:00:00Z");
    expect(raceHour(new Date("2026-10-20T18:00:00Z"), start)).toBe(1);
    expect(raceHour(new Date("2026-10-20T19:30:00Z"), start)).toBe(2);
    expect(raceHour(new Date("2026-10-21T17:59:59Z"), start)).toBe(24);
  });
});
