import { describe, expect, it } from "vitest";
import {
  cursusdienstWeekStartKey,
  parseWeek,
  parseWeekStart,
  weekToEntries,
} from "@/lib/cursusdienstHoursMap";

describe("parseWeek", () => {
  it("accepts a well-formed payload", () => {
    const week = parseWeek({
      association: "vtk",
      week: [{ dayOfWeek: 1, ranges: [{ start: "10:30", end: "18:00" }] }],
    });
    expect(week).toEqual([{ dayOfWeek: 1, ranges: [{ start: "10:30", end: "18:00" }] }]);
  });

  it("treats an empty week as valid (fully closed), not an error", () => {
    expect(parseWeek({ week: [] })).toEqual([]);
  });

  it("rejects malformed shapes", () => {
    expect(parseWeek(null)).toBeNull();
    expect(parseWeek({})).toBeNull();
    expect(parseWeek({ week: "nope" })).toBeNull();
    expect(parseWeek({ week: [{ dayOfWeek: "1", ranges: [] }] })).toBeNull();
    expect(parseWeek({ week: [{ dayOfWeek: 1, ranges: [{ start: "10:00" }] }] })).toBeNull();
  });
});

describe("week selection", () => {
  it("selects the current week on weekdays and next week during the weekend", () => {
    expect(cursusdienstWeekStartKey(new Date("2026-08-21T12:00:00Z"))).toBe("2026-08-17");
    expect(cursusdienstWeekStartKey(new Date("2026-08-22T12:00:00Z"))).toBe("2026-08-24");
    expect(cursusdienstWeekStartKey(new Date("2026-08-23T12:00:00Z"))).toBe("2026-08-24");
  });

  it("only accepts an explicit ISO week start from Cudi", () => {
    expect(parseWeekStart({ weekStart: "2026-08-24" })).toBe("2026-08-24");
    expect(parseWeekStart({})).toBeNull();
    expect(parseWeekStart({ weekStart: "24/08/2026" })).toBeNull();
  });
});

describe("weekToEntries", () => {
  it("maps cudi's weekday convention onto Monday-through-Friday entries", () => {
    const entries = weekToEntries(
      [
        { dayOfWeek: 1, ranges: [{ start: "10:30", end: "18:00" }] },
        { dayOfWeek: 0, ranges: [{ start: "13:00", end: "17:00" }] },
      ],
      "nl",
    );

    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({ dayNl: "Maandag", dayEn: "Monday", hours: "10:30 – 18:00" });
    expect(entries.some((entry) => entry.dayNl === "Zondag")).toBe(false);
    // Tuesday has no rows → closed.
    expect(entries[1]).toEqual({ dayNl: "Dinsdag", dayEn: "Tuesday", hours: "Gesloten" });
  });

  it("joins multiple ranges on one day (e.g. a lunch break)", () => {
    const entries = weekToEntries(
      [
        {
          dayOfWeek: 3,
          ranges: [
            { start: "10:00", end: "13:00" },
            { start: "14:00", end: "18:00" },
          ],
        },
      ],
      "nl",
    );
    expect(entries[2]).toEqual({
      dayNl: "Woensdag",
      dayEn: "Wednesday",
      hours: "10:00 – 13:00, 14:00 – 18:00",
    });
  });

  it("localises the closed label for English", () => {
    const entries = weekToEntries([], "en");
    expect(entries.every((e) => e.hours === "Closed")).toBe(true);
    expect(entries[0].dayEn).toBe("Monday");
  });
});
