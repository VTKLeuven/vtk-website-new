import { describe, expect, it } from "vitest";
import { parseWeek, weekToEntries } from "@/lib/cursusdienstHoursMap";

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

describe("weekToEntries", () => {
  it("maps cudi's Sunday=0 convention onto Monday-first entries", () => {
    // Monday (jsDay 1) and Sunday (jsDay 0) have hours; the rest are closed.
    const entries = weekToEntries(
      [
        { dayOfWeek: 1, ranges: [{ start: "10:30", end: "18:00" }] },
        { dayOfWeek: 0, ranges: [{ start: "13:00", end: "17:00" }] },
      ],
      "nl",
    );

    expect(entries).toHaveLength(7);
    expect(entries[0]).toEqual({ dayNl: "Maandag", dayEn: "Monday", hours: "10:30 – 18:00" });
    expect(entries[6]).toEqual({ dayNl: "Zondag", dayEn: "Sunday", hours: "13:00 – 17:00" });
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
