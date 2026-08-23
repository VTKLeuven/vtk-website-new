import { describe, expect, it } from "vitest";
import {
  entriesForService,
  isBrusselsWeekend,
  readOpeningHoursSetting,
} from "@/lib/openingHoursSettings";

describe("opening-hours settings", () => {
  it("toont Theokot alleen van maandag tot en met vrijdag", () => {
    const setting = readOpeningHoursSetting(undefined, "theokot");
    const entries = entriesForService(setting, "theokot", "nl");
    expect(entries.map((entry) => entry.dayNl)).toEqual([
      "Maandag",
      "Dinsdag",
      "Woensdag",
      "Donderdag",
      "Vrijdag",
    ]);
    expect(entries.every((entry) => entry.hours === "Gesloten")).toBe(true);
  });

  it("toont 't ElixIr van zondag tot en met donderdag, met zondag eerst", () => {
    const setting = readOpeningHoursSetting({
      entries: [{ dayNl: "Zondag", dayEn: "Sunday", hours: "22:00" }],
    }, "elixir");
    const entries = entriesForService(setting, "elixir", "en");
    expect(entries.map((entry) => entry.dayEn)).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
    ]);
    expect(entries[0].hours).toBe("22:00");
    expect(entries.slice(1).every((entry) => entry.hours === "Closed")).toBe(true);
  });

  it("herkent het weekend in Brussels tijd", () => {
    expect(isBrusselsWeekend(new Date("2026-08-21T21:30:00Z"))).toBe(false);
    expect(isBrusselsWeekend(new Date("2026-08-21T22:30:00Z"))).toBe(true);
    expect(isBrusselsWeekend(new Date("2026-08-23T12:00:00Z"))).toBe(true);
  });
});
