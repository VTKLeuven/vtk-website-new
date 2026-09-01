import { describe, expect, it } from "vitest";
import {
  heroWeekDayKeys,
  selectHeroWeek,
  type HeroWeekInput,
} from "@/lib/calendar/heroWeek";

/**
 * De regels van het weekoverzicht in de hero. Alle momenten hieronder staan in
 * Brusselse tijd geschreven als UTC-offset, zodat de test hetzelfde antwoord
 * geeft op een laptop en op de server.
 *
 * Zaterdag 19 september 2026 is de zaterdag in deze week; zondag 13 september is
 * de referentiedag ("vandaag") in de meeste tests.
 */

function at(iso: string): Date {
  return new Date(iso);
}

function event(id: string, iso: string, heroWeek: HeroWeekInput["heroWeek"] = "AUTO"): HeroWeekInput {
  return { id, start: at(iso), heroWeek };
}

const sunday13 = at("2026-09-13T10:00:00+02:00");

describe("heroWeekDayKeys", () => {
  it("shows six days from today and skips Saturday", () => {
    expect(heroWeekDayKeys(sunday13)).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
  });

  it("starts yesterday when something was on", () => {
    const monday14 = at("2026-09-14T09:00:00+02:00");
    expect(heroWeekDayKeys(monday14, { includeYesterday: true })).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
  });

  it("never starts on a Saturday, not even as yesterday", () => {
    // Zondag 20 september; gisteren was zaterdag 19 en die kan niet getoond
    // worden, dus het venster begint gewoon vandaag.
    const sunday20 = at("2026-09-20T09:00:00+02:00");
    expect(heroWeekDayKeys(sunday20, { includeYesterday: true })[0]).toBe("2026-09-20");
  });

  it("skips today when today is a Saturday", () => {
    const saturday19 = at("2026-09-19T11:00:00+02:00");
    expect(heroWeekDayKeys(saturday19)[0]).toBe("2026-09-20");
  });

  it("keeps counting past the skipped Saturday", () => {
    // Woensdag 16: het venster loopt tot en met maandag 21, want zaterdag 19
    // telt niet mee als een van de zes.
    const wednesday16 = at("2026-09-16T08:00:00+02:00");
    expect(heroWeekDayKeys(wednesday16)).toEqual([
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
  });

  it("puts a late-evening moment on the Brussels day, not the UTC one", () => {
    // 23:30 Brusselse tijd is 21:30 UTC; de dag mag niet doorschuiven.
    expect(heroWeekDayKeys(at("2026-09-13T23:30:00+02:00"))[0]).toBe("2026-09-13");
  });
});

describe("selectHeroWeek", () => {
  const busyWeek: HeroWeekInput[] = [
    event("onthaal", "2026-09-13T10:00:00+02:00"),
    event("info", "2026-09-14T14:00:00+02:00"),
    event("cantus", "2026-09-14T20:00:00+02:00"),
    event("sport", "2026-09-15T16:00:00+02:00"),
    event("bedrijven", "2026-09-16T19:30:00+02:00"),
    event("lezing", "2026-09-17T17:00:00+02:00"),
    event("pasta", "2026-09-17T19:00:00+02:00"),
    event("quiz", "2026-09-17T22:00:00+02:00"),
    event("alma", "2026-09-18T12:00:00+02:00"),
    event("loopje", "2026-09-18T20:30:00+02:00"),
  ];

  it("fills the window and keeps every day, including the empty ones", () => {
    const result = selectHeroWeek(busyWeek, sunday13);
    expect(result.mode).toBe("window");
    expect(result.days).toHaveLength(6);
    expect(result.days.map((day) => day.events.length)).toEqual([1, 2, 1, 1, 3, 2]);
  });

  it("caps a day at three events and reports the rest", () => {
    const crowded = [
      ...busyWeek,
      event("extra", "2026-09-17T23:30:00+02:00"),
    ];
    const thursday = selectHeroWeek(crowded, sunday13).days.find((d) => d.key === "2026-09-17");
    expect(thursday?.events).toHaveLength(3);
    expect(thursday?.more).toBe(1);
  });

  it("stops at ten events in total and counts the rest as more", () => {
    const crowded = [
      ...busyWeek,
      event("extra-1", "2026-09-18T21:00:00+02:00"),
      event("extra-2", "2026-09-18T22:00:00+02:00"),
    ];
    const result = selectHeroWeek(crowded, sunday13);
    expect(result.total).toBe(10);
    const friday = result.days.find((day) => day.key === "2026-09-18");
    // Vrijdag heeft er vier staan; de dagkap laat er drie toe en het totaal
    // stond na donderdag al op acht, dus er passen er nog twee.
    expect(friday?.events).toHaveLength(2);
    expect(friday?.more).toBe(2);
  });

  it("puts a pinned event first on its day and protects it from the cap", () => {
    const crowded = [
      ...busyWeek,
      event("uitgelicht", "2026-09-17T23:30:00+02:00", "PINNED"),
    ];
    const thursday = selectHeroWeek(crowded, sunday13).days.find((d) => d.key === "2026-09-17");
    expect(thursday?.events.map((e) => e.id)).toEqual(["uitgelicht", "lezing", "pasta"]);
  });

  it("leaves hidden events out everywhere", () => {
    const withHidden = busyWeek.map((e) =>
      e.id === "pasta" ? { ...e, heroWeek: "HIDDEN" as const } : e,
    );
    const ids = selectHeroWeek(withHidden, sunday13).days.flatMap((d) => d.events.map((e) => e.id));
    expect(ids).not.toContain("pasta");
    const thursday = selectHeroWeek(withHidden, sunday13).days.find((d) => d.key === "2026-09-17");
    expect(thursday?.more).toBe(0);
  });

  it("shows yesterday when it had an event", () => {
    const monday14 = at("2026-09-14T09:00:00+02:00");
    const result = selectHeroWeek(busyWeek, monday14);
    expect(result.days[0]?.key).toBe("2026-09-13");
    expect(result.days[0]?.events.map((e) => e.id)).toEqual(["onthaal"]);
  });

  it("starts today when yesterday was empty", () => {
    const withoutSunday = busyWeek.filter((e) => e.id !== "onthaal");
    const monday14 = at("2026-09-14T09:00:00+02:00");
    expect(selectHeroWeek(withoutSunday, monday14).days[0]?.key).toBe("2026-09-14");
  });

  it("fills the quiet-week list up to its default maximum", () => {
    const quiet: HeroWeekInput[] = [
      event("een", "2026-09-14T20:00:00+02:00"),
      event("twee", "2026-09-17T19:00:00+02:00"),
      event("drie", "2026-10-06T19:00:00+02:00"),
      event("vier", "2026-10-13T19:00:00+02:00"),
      event("vijf", "2026-10-20T19:00:00+02:00"),
      event("zes", "2026-10-21T19:00:00+02:00"),
      event("zeven", "2026-10-22T19:00:00+02:00"),
      event("acht", "2026-10-23T19:00:00+02:00"),
      event("negen", "2026-10-24T19:00:00+02:00"),
    ];
    const result = selectHeroWeek(quiet, sunday13);
    expect(result.mode).toBe("next");
    expect(result.days.flatMap((day) => day.events.map((e) => e.id))).toEqual([
      "een",
      "twee",
      "drie",
      "vier",
      "vijf",
      "zes",
      "zeven",
      "acht",
    ]);
  });

  it("honours the configured quiet-week maximum", () => {
    const quiet = [
      event("een", "2026-09-14T20:00:00+02:00"),
      event("twee", "2026-09-17T19:00:00+02:00"),
      event("drie", "2026-10-06T19:00:00+02:00"),
      event("vier", "2026-10-13T19:00:00+02:00"),
      event("vijf", "2026-10-20T19:00:00+02:00"),
      event("zes", "2026-10-21T19:00:00+02:00"),
    ];

    const result = selectHeroWeek(quiet, sunday13, { nextLimit: 5 });
    expect(result.days.flatMap((day) => day.events.map((e) => e.id))).toEqual([
      "een",
      "twee",
      "drie",
      "vier",
      "vijf",
    ]);
    expect(result.total).toBe(5);
  });

  it("keeps the window at exactly four events", () => {
    const four: HeroWeekInput[] = [
      event("een", "2026-09-14T20:00:00+02:00"),
      event("twee", "2026-09-15T19:00:00+02:00"),
      event("drie", "2026-09-17T19:00:00+02:00"),
      event("vier", "2026-09-18T19:00:00+02:00"),
    ];
    expect(selectHeroWeek(four, sunday13).mode).toBe("window");
  });

  it("does not drag yesterday into the fallback list", () => {
    const quiet: HeroWeekInput[] = [
      event("gisteren", "2026-09-13T20:00:00+02:00"),
      event("later", "2026-10-06T19:00:00+02:00"),
    ];
    const monday14 = at("2026-09-14T09:00:00+02:00");
    const result = selectHeroWeek(quiet, monday14);
    expect(result.mode).toBe("next");
    expect(result.days.flatMap((day) => day.events.map((e) => e.id))).toEqual(["later"]);
  });

  it("returns an empty list when there is nothing left at all", () => {
    const result = selectHeroWeek([], sunday13);
    expect(result.mode).toBe("next");
    expect(result.days).toEqual([]);
    expect(result.total).toBe(0);
  });
});
