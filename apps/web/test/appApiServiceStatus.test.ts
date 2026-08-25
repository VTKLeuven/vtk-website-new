import { describe, expect, it } from "vitest";

import { serviceStatus } from "@/lib/app-api/serviceStatus";

/**
 * "Is het nu open, en hoe lang nog."
 *
 * De reden dat dit bestaat naast `isOpenAt` in `hoursUtils`: die rekent met
 * `Date#getHours()` en dus met de tijdzone van het proces. Deze tests draaien
 * daarom bewust met instants in UTC en verwachten het Brusselse antwoord; zou
 * iemand de Brussel-omrekening eruit halen, dan vallen ze om op elke machine die
 * niet toevallig op Europe/Brussels staat.
 */

const setting = {
  titleNl: "Openingsuren Theokot",
  titleEn: "Theokot opening hours",
  noteNl: "",
  noteEn: "",
  entries: [
    { dayNl: "Maandag", dayEn: "Monday", hours: "12:00 - 14:00" },
    { dayNl: "Dinsdag", dayEn: "Tuesday", hours: "12:00 - 14:00" },
    { dayNl: "Woensdag", dayEn: "Wednesday", hours: "Gesloten" },
    { dayNl: "Donderdag", dayEn: "Thursday", hours: "12:00 - 14:00" },
    { dayNl: "Vrijdag", dayEn: "Friday", hours: "12:00 - 14:00" },
    { dayNl: "Zaterdag", dayEn: "Saturday", hours: "Gesloten" },
    { dayNl: "Zondag", dayEn: "Sunday", hours: "Gesloten" },
  ],
};

const base = { key: "theokot" as const, service: "theokot" as const, setting };

describe("openingsuren op de Brusselse klok", () => {
  /** Dinsdag 15 september 2026, 11:00 UTC = 13:00 in Brussel (zomertijd). */
  it("zegt tot hoe laat het open is", () => {
    const status = serviceStatus(base, "nl", new Date("2026-09-15T11:00:00.000Z"));
    expect(status.openNow).toBe(true);
    expect(status.detail).toBe("tot 14:00");
    expect(status.live).toBe(false);
    expect(status.name).toBe("Theokot");
  });

  /**
   * 11:00 UTC in de winter is 12:00 in Brussel en dus net open; zou de code met
   * UTC rekenen, dan stond het hier nog dicht. Dat is precies de fout die deze
   * module moet uitsluiten.
   */
  it("volgt de wintertijd mee", () => {
    const status = serviceStatus(base, "nl", new Date("2026-12-15T11:30:00.000Z"));
    expect(status.openNow).toBe(true);
    expect(status.detail).toBe("tot 14:00");
  });

  it("noemt het volgende openingsuur wanneer het nog moet beginnen", () => {
    // Dinsdag 08:00 in Brussel: vandaag gaat het nog open.
    const status = serviceStatus(base, "nl", new Date("2026-09-15T06:00:00.000Z"));
    expect(status.openNow).toBe(false);
    expect(status.detail).toBe("opent 12:00");
  });

  it("slaat een gesloten dag over en noemt de eerstvolgende", () => {
    // Woensdag 15:00 in Brussel: die dag is gesloten, donderdag is de eerste.
    const status = serviceStatus(base, "nl", new Date("2026-09-16T13:00:00.000Z"));
    expect(status.openNow).toBe(false);
    expect(status.detail).toBe("do 12:00");
  });

  it("zegt gesloten wanneer er in het hele rooster niets openstaat", () => {
    const closed = {
      ...base,
      setting: { ...setting, entries: setting.entries.map((entry) => ({ ...entry, hours: "Gesloten" })) },
    };
    const status = serviceStatus(closed, "nl", new Date("2026-09-15T11:00:00.000Z"));
    expect(status.openNow).toBe(false);
    expect(status.detail).toBe("gesloten");
  });

  /**
   * De geluidsmeting van 't ElixIr wint van het rooster. De aanroeper geeft
   * `null` door zodra de meting verouderd is; dan telt het rooster weer, want een
   * verouderde "open" is erger dan geen antwoord.
   */
  it("laat een verse meting van het rooster winnen", () => {
    const duringHours = new Date("2026-09-15T11:00:00.000Z");
    const measuredClosed = serviceStatus(
      { ...base, key: "elixir", service: "elixir", measuredOpen: false },
      "nl",
      duringHours,
    );
    expect(measuredClosed.openNow).toBe(false);
    expect(measuredClosed.live).toBe(true);

    const outsideHours = new Date("2026-09-15T20:00:00.000Z");
    const measuredOpen = serviceStatus(
      { ...base, key: "elixir", service: "elixir", measuredOpen: true },
      "nl",
      outsideHours,
    );
    expect(measuredOpen.openNow).toBe(true);
    expect(measuredOpen.detail).toBe("nu open");
  });

  it("valt terug op het rooster zodra de meting niet meer meegegeven wordt", () => {
    const status = serviceStatus(
      { ...base, key: "elixir", service: "elixir", measuredOpen: null },
      "nl",
      new Date("2026-09-15T11:00:00.000Z"),
    );
    expect(status.live).toBe(false);
    expect(status.openNow).toBe(true);
  });

  /**
   * De cursusdienst-uren komen live van cudi. Lukt die lezing niet, dan mag er
   * geen leeg rooster getoond worden: dat leest als "altijd gesloten".
   */
  it("meldt ontbrekende uren in plaats van een leeg rooster", () => {
    const status = serviceStatus(
      { key: "cursusdienst", service: "cursusdienst", setting, liveEntries: null },
      "nl",
      new Date("2026-09-15T11:00:00.000Z"),
    );
    expect(status.unavailable).toBe(true);
    expect(status.entries).toEqual([]);
    expect(status.detail).toBe("Uren niet beschikbaar");
  });

  it("antwoordt in het Engels wanneer daar om gevraagd wordt", () => {
    const open = serviceStatus(base, "en", new Date("2026-09-15T11:00:00.000Z"));
    expect(open.detail).toBe("until 14:00");

    const later = serviceStatus(base, "en", new Date("2026-09-16T13:00:00.000Z"));
    expect(later.detail).toBe("thu 12:00");
  });
});

/**
 * 't ElixIr slaat enkel een openingsuur op ("22:00") en geen bereik: een fakbar
 * opent om tien uur en sluit wanneer ze sluit. `parseHoursRange` kent die vorm
 * niet en gaf `null`, waardoor de bar de hele week als gesloten las op het
 * beginscherm. Deze tests houden dat vast.
 */
describe("een dag zonder sluitingsuur", () => {
  const barSetting = {
    titleNl: "'t ElixIr",
    titleEn: "'t ElixIr",
    noteNl: "",
    noteEn: "",
    entries: [
      { dayNl: "Zondag", dayEn: "Sunday", hours: "22:00" },
      { dayNl: "Maandag", dayEn: "Monday", hours: "22:00" },
      { dayNl: "Dinsdag", dayEn: "Tuesday", hours: "22:00" },
      { dayNl: "Woensdag", dayEn: "Wednesday", hours: "22:00" },
      { dayNl: "Donderdag", dayEn: "Thursday", hours: "22:00" },
      { dayNl: "Vrijdag", dayEn: "Friday", hours: "Gesloten" },
      { dayNl: "Zaterdag", dayEn: "Saturday", hours: "Gesloten" },
    ],
  };
  const bar = { key: "elixir" as const, service: "elixir" as const, setting: barSetting };

  it("gaat open op het uur dat er staat", () => {
    // Dinsdag 22:30 in Brussel.
    const status = serviceStatus(bar, "nl", new Date("2026-09-15T20:30:00.000Z"));
    expect(status.openNow).toBe(true);
    expect(status.detail).toBe("nu open");
  });

  it("noemt het openingsuur wanneer het nog moet komen", () => {
    // Dinsdag 15:00 in Brussel.
    const status = serviceStatus(bar, "nl", new Date("2026-09-15T13:00:00.000Z"));
    expect(status.openNow).toBe(false);
    expect(status.detail).toBe("opent 22:00");
  });

  it("slaat de gesloten dagen over", () => {
    // Vrijdag 23:00 in Brussel: vrijdag en zaterdag zijn dicht, zondag is de eerste.
    const status = serviceStatus(bar, "nl", new Date("2026-09-18T21:00:00.000Z"));
    expect(status.openNow).toBe(false);
    expect(status.detail).toBe("zo 22:00");
  });
});
