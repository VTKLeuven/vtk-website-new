import { describe, expect, it } from "vitest";

import {
  suggestCalendarEvents,
  titleSimilarity,
  type CalendarCandidate,
} from "@/lib/ticketing/calendarSuggestion";

function candidate(overrides: Partial<CalendarCandidate> & { id: string }): CalendarCandidate {
  return {
    titleNl: "Event",
    titleEn: null,
    start: new Date("2026-12-12T18:00:00Z"),
    end: new Date("2026-12-12T23:00:00Z"),
    publishedAt: new Date("2026-11-01T10:00:00Z"),
    ...overrides,
  };
}

describe("titleSimilarity", () => {
  it("negeert hoofdletters, accenten, jaartallen en vulwoorden", () => {
    expect(titleSimilarity("Galabal 2026", "galabal: The Great Gatsby")).toBe(1);
    expect(titleSimilarity("Tickets Reünie", "VTK reunie")).toBe(1);
    expect(titleSimilarity("Galabal 2025", "Galabal 2026")).toBe(1);
  });

  it("geeft 0 wanneer een titel enkel ruis bevat", () => {
    expect(titleSimilarity("Tickets 2026", "Galabal 2026")).toBe(0);
  });
});

describe("suggestCalendarEvents", () => {
  const ticket = { titleNl: "Galabal", startsAt: new Date("2026-12-12T19:00:00Z") };

  it("stelt een event op dezelfde dag voor, ook met een andere titel", () => {
    const result = suggestCalendarEvents(ticket, [candidate({ id: "a", titleNl: "Winterbal" })]);
    expect(result.map((match) => match.id)).toEqual(["a"]);
    expect(result[0]).toMatchObject({ sameDay: true, similarTitle: false, dayDistance: 0 });
  });

  it("zet op dezelfde dag de gelijkaardige titel eerst", () => {
    const result = suggestCalendarEvents(ticket, [
      candidate({ id: "cantus", titleNl: "Cantus" }),
      candidate({ id: "gala", titleNl: "Galabal 2026" }),
    ]);
    expect(result.map((match) => match.id)).toEqual(["gala", "cantus"]);
  });

  it("stelt een event op een andere dag enkel voor met een gelijkaardige titel", () => {
    const result = suggestCalendarEvents(ticket, [
      candidate({ id: "verschoven", titleNl: "Galabal", start: new Date("2026-12-19T18:00:00Z"), end: new Date("2026-12-19T23:00:00Z") }),
      candidate({ id: "ander", titleNl: "Cantus", start: new Date("2026-12-13T18:00:00Z"), end: new Date("2026-12-13T23:00:00Z") }),
    ]);
    expect(result.map((match) => match.id)).toEqual(["verschoven"]);
    expect(result[0]).toMatchObject({ sameDay: false, similarTitle: true, dayDistance: 7 });
  });

  it("laat een gelijkaardige titel buiten het venster vallen", () => {
    const result = suggestCalendarEvents(ticket, [
      candidate({ id: "vorig-jaar", titleNl: "Galabal", start: new Date("2025-12-13T18:00:00Z"), end: new Date("2025-12-13T23:00:00Z") }),
    ]);
    expect(result).toEqual([]);
  });

  it("telt een verkoop binnen een event over meerdere dagen als dezelfde dag", () => {
    const result = suggestCalendarEvents(
      { titleNl: "Zaterdag", startsAt: new Date("2026-12-12T09:00:00Z") },
      [candidate({ id: "weekend", titleNl: "Weekend", start: new Date("2026-12-11T16:00:00Z"), end: new Date("2026-12-13T14:00:00Z") })],
    );
    expect(result[0]).toMatchObject({ id: "weekend", sameDay: true });
  });

  it("telt een nacht na middernacht bij de avond ervoor", () => {
    // Zaterdag 20:00 tot zondag 3:00 (Brussel); de verkoop is zondagavond.
    const result = suggestCalendarEvents(
      { titleNl: "Galabal", startsAt: new Date("2026-12-13T19:00:00Z") },
      [candidate({ id: "zaterdag", titleNl: "Galabal", start: new Date("2026-12-12T19:00:00Z"), end: new Date("2026-12-13T02:00:00Z") })],
    );
    expect(result[0]).toMatchObject({ sameDay: false, dayDistance: 1 });
  });

  it("rekent de dag op de Brusselse klok", () => {
    // 23:30 in Brussel is 22:30 UTC: nog dezelfde dag als het event.
    const result = suggestCalendarEvents(
      { titleNl: "Nachtcantus", startsAt: new Date("2026-12-12T22:30:00Z") },
      [candidate({ id: "a", titleNl: "Iets anders" })],
    );
    expect(result[0]?.sameDay).toBe(true);
  });

  it("geeft hoogstens drie voorstellen", () => {
    const many = ["a", "b", "c", "d"].map((id) => candidate({ id }));
    expect(suggestCalendarEvents(ticket, many)).toHaveLength(3);
  });
});
