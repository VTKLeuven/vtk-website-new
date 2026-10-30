import { describe, expect, it } from "vitest";
import { allWithinWeek, pickHeroEvents, relativeDay } from "@/lib/home/heroEvents";

const event = (id: string, featured = false) => ({
  id,
  homeFeaturedAt: featured ? new Date("2026-10-01T10:00:00Z") : null,
});
const ids = (events: Array<{ id: string }>) => events.map((item) => item.id);

describe("pickHeroEvents", () => {
  it("toont zonder keuze de eerstvolgende vier", () => {
    const upcoming = ["a", "b", "c", "d", "e"].map((id) => event(id));
    expect(ids(pickHeroEvents(upcoming))).toEqual(["a", "b", "c", "d"]);
  });

  it("vult de overige plaatsen aan en houdt de volgorde van de agenda", () => {
    const upcoming = [event("a"), event("b"), event("c"), event("d"), event("galabal", true)];
    expect(ids(pickHeroEvents(upcoming))).toEqual(["a", "b", "c", "galabal"]);
  });

  it("laat enkel uitgelichte zien wanneer die alle plaatsen vullen", () => {
    const upcoming = [
      event("a"),
      event("b", true),
      event("c", true),
      event("d", true),
      event("e", true),
    ];
    expect(ids(pickHeroEvents(upcoming))).toEqual(["b", "c", "d", "e"]);
  });

  it("geeft de eerstvolgende voorrang wanneer er te veel uitgelicht zijn", () => {
    const upcoming = ["a", "b", "c", "d", "e"].map((id) => event(id, true));
    expect(ids(pickHeroEvents(upcoming))).toEqual(["a", "b", "c", "d"]);
  });

  it("toont wat er is wanneer er minder dan vier komen", () => {
    expect(ids(pickHeroEvents([event("a"), event("b", true)]))).toEqual(["a", "b"]);
    expect(pickHeroEvents([])).toEqual([]);
  });
});

describe("allWithinWeek", () => {
  const now = new Date("2026-10-30T10:00:00Z");

  it("klopt enkel wanneer elke kaart binnen de zeven dagen valt", () => {
    expect(allWithinWeek([{ start: new Date("2026-11-05T19:00:00Z") }], now)).toBe(true);
    expect(allWithinWeek([{ start: new Date("2026-11-20T19:00:00Z") }], now)).toBe(false);
  });

  it("kijkt bij een reeks naar het eerstvolgende moment", () => {
    const series = {
      start: new Date("2026-10-01T16:00:00Z"),
      moments: [
        { start: new Date("2026-10-01T16:00:00Z"), end: new Date("2026-10-01T17:00:00Z"), label: null },
        { start: new Date("2026-11-02T17:00:00Z"), end: new Date("2026-11-02T18:00:00Z"), label: null },
      ],
    };
    expect(allWithinWeek([series], now)).toBe(true);
  });
});

describe("relativeDay", () => {
  it("rekent op de Brusselse klok en niet op die van de server", () => {
    // 23:30 UTC op 31 oktober is al 00:30 op 1 november in Brussel.
    const now = new Date("2026-10-31T23:30:00Z");
    expect(relativeDay(new Date("2026-11-01T19:00:00Z"), now)).toBe("today");
    expect(relativeDay(new Date("2026-11-02T19:00:00Z"), now)).toBe("tomorrow");
    expect(relativeDay(new Date("2026-11-03T19:00:00Z"), now)).toBeNull();
  });
});
