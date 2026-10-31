import { describe, expect, it } from "vitest";
import {
  formatHms,
  hourLabelIndexes,
  hourSegments,
  hoursRun,
  raceClockParts,
  raceHourCount,
} from "@/lib/urenloop/raceClock";

const start = new Date("2026-10-20T18:00:00.000Z");
const end = new Date("2026-10-21T18:00:00.000Z");

describe("de klok van de 24 urenloop-frontpage", () => {
  it("telt af in dagen, uren, minuten en seconden, en nooit onder nul", () => {
    const ms = ((4 * 24 + 21) * 3600 + 45 * 60 + 12) * 1000;
    expect(raceClockParts(ms)).toEqual({ days: 4, hours: 21, minutes: 45, seconds: 12 });
    expect(raceClockParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(raceClockParts(Number.NaN)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("toont de tijd op de piste in uren doorgeteld, ook voorbij een dag", () => {
    expect(formatHms((7 * 3600 + 40 * 60 + 12) * 1000)).toBe("07:40:12");
    expect(formatHms(24 * 3600 * 1000)).toBe("24:00:00");
    expect(formatHms(26 * 3600 * 1000)).toBe("26:00:00");
  });
});

describe("de urenbalk", () => {
  it("telt zoveel vakjes als de race uren duurt", () => {
    expect(raceHourCount(start, end)).toBe(24);
    expect(raceHourCount(start, new Date(start.getTime() + 23 * 3_600_000))).toBe(23);
    // Een finish voor de start is een tikfout in het beheer, geen race van nul uur.
    expect(raceHourCount(start, start)).toBe(1);
  });

  it("vult de gelopen uren, het lopende uur half en de rest niet", () => {
    const now = new Date(start.getTime() + 7.5 * 3_600_000);
    const run = hoursRun(start, end, now);
    expect(run).toBe(7.5);
    const segments = hourSegments(24, run, "live");
    expect(segments.slice(0, 7).every((s) => s.state === "done")).toBe(true);
    expect(segments[7]).toEqual({ state: "now", fill: 0.5 });
    expect(segments[8].state).toBe("todo");
  });

  it("staat leeg voor de start en vol na de finish", () => {
    expect(hourSegments(24, 0, "before").every((s) => s.state === "todo")).toBe(true);
    expect(hourSegments(24, 23.9, "final").every((s) => s.state === "done")).toBe(true);
    expect(hoursRun(start, end, new Date(end.getTime() + 3_600_000))).toBe(24);
  });

  it("zet om de vier uur een uur onder de balk, de start inbegrepen", () => {
    expect(hourLabelIndexes(24)).toEqual([0, 4, 8, 12, 16, 20]);
    expect(hourLabelIndexes(23)).toEqual([0, 4, 8, 12, 16, 20]);
  });
});
