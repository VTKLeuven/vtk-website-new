import { describe, expect, it } from "vitest";
import { elixirScheduleFromSetting } from "@/lib/elixir/openingWindow";
import {
  brusselsWeekClock,
  buildHoursBand,
  elixirStatus,
  knownDaysAhead,
  parseHoursWindows,
  scheduleStatus,
  timelineAxis,
  timelineMoment,
  weekFromEntries,
  weekFromOpeningTimes,
  type HoursServiceInput,
} from "@/lib/openingHoursWeek";

// Oktober 2026 is nog zomertijd (tot zondag 25 oktober): Brussel = UTC+2.
const TUE_1252 = new Date("2026-10-20T10:52:00Z");
const TUE_1610 = new Date("2026-10-20T14:10:00Z");
const TUE_1820 = new Date("2026-10-20T16:20:00Z");
const TUE_2240 = new Date("2026-10-20T20:40:00Z");
const WED_0130 = new Date("2026-10-20T23:30:00Z");
const FRI_1600 = new Date("2026-10-23T14:00:00Z");
const SAT_1252 = new Date("2026-10-17T10:52:00Z");

const THEOKOT = weekFromEntries([
  { dayNl: "Maandag", hours: "10:30 - 18:00" },
  { dayNl: "Dinsdag", hours: "10:30 - 18:00" },
  { dayNl: "Woensdag", hours: "10:30 - 18:00" },
  { dayNl: "Donderdag", hours: "10:30 - 18:00" },
  { dayNl: "Vrijdag", hours: "10:30 - 16:00" },
]);

// Zoals `weekToEntries` ze samenvoegt.
const CUDI = weekFromEntries([
  { dayNl: "Maandag", hours: "12:35 – 13:50" },
  { dayNl: "Dinsdag", hours: "12:30 – 14:00, 18:00 – 19:00" },
  { dayNl: "Woensdag", hours: "Gesloten" },
  { dayNl: "Donderdag", hours: "12:35 – 13:50" },
  { dayNl: "Vrijdag", hours: "Gesloten" },
]);

const ELIXIR = weekFromOpeningTimes([1320, 1320, 1320, 1320, null, null, 1320]);

function status(week = CUDI, now = TUE_1252, recurring = false) {
  const clock = brusselsWeekClock(now);
  return scheduleStatus(week, clock, knownDaysAhead(clock, recurring), "nl");
}

describe("parseHoursWindows", () => {
  it("leest één venster", () => {
    expect(parseHoursWindows("10:30 - 18:00")).toEqual([{ start: 630, end: 1080 }]);
  });

  it("leest elk venster van de cursusdienst, niet enkel het eerste", () => {
    expect(parseHoursWindows("12:30 – 14:00, 18:00 – 19:00")).toEqual([
      { start: 750, end: 840 },
      { start: 1080, end: 1140 },
    ]);
  });

  it("leest een openingsuur zonder einde als een avond zonder sluitingsuur", () => {
    expect(parseHoursWindows("22:00")).toEqual([{ start: 1320, end: null }]);
    expect(parseHoursWindows("22u30")).toEqual([{ start: 1350, end: null }]);
  });

  it("leest 22h-... zoals het in productie stond", () => {
    expect(parseHoursWindows("22h-...")).toEqual([{ start: 1320, end: null }]);
  });

  it("laat een einde voor het begin over middernacht lopen", () => {
    expect(parseHoursWindows("22:00 - 03:00")).toEqual([{ start: 1320, end: 1620 }]);
  });

  it("geeft niets voor een gesloten dag", () => {
    expect(parseHoursWindows("Gesloten")).toEqual([]);
    expect(parseHoursWindows("Closed")).toEqual([]);
    expect(parseHoursWindows("")).toEqual([]);
  });
});

describe("scheduleStatus", () => {
  it("is open in het eerste venster en noemt het tweede", () => {
    expect(status()).toEqual({
      state: "open",
      label: "Open tot 14:00",
      extra: "Vanavond weer open van 18:00 tot 19:00",
    });
  });

  it("is tussen de vensters gesloten tot vanavond", () => {
    expect(status(CUDI, TUE_1610)).toMatchObject({ state: "closed", label: "Opent vanavond om 18:00" });
  });

  it("is open in het tweede venster", () => {
    expect(status(CUDI, TUE_1820)).toEqual({ state: "open", label: "Open tot 19:00", extra: null });
  });

  it("slaat een gesloten dag over", () => {
    expect(status(CUDI, TUE_2240)).toMatchObject({ label: "Opent donderdag om 12:35" });
  });

  it("kijkt in het weekend naar de opgehaalde volgende week", () => {
    expect(status(CUDI, SAT_1252)).toMatchObject({ state: "closed", label: "Opent maandag om 12:35" });
  });

  it("raadt geen uren van een week die de cursusdienst niet gaf", () => {
    expect(status(CUDI, FRI_1600)).toMatchObject({ state: "closed", label: "Gesloten" });
  });

  it("laat een terugkerend rooster wel naar volgende week kijken", () => {
    expect(status(THEOKOT, FRI_1600, true)).toMatchObject({ label: "Opent maandag om 10:30" });
  });

  it("rekent op de klok van Brussel en niet op die van het proces", () => {
    // 8:52 UTC is 10:52 in Brussel: het Theokot is open. Op de klok van een
    // container in UTC zou het nog gesloten zijn.
    const morning = new Date("2026-10-20T08:52:00Z");
    expect(status(THEOKOT, morning, true)).toMatchObject({ state: "open", label: "Open tot 18:00" });
  });

  it("spreekt Engels", () => {
    const clock = brusselsWeekClock(SAT_1252);
    expect(scheduleStatus(CUDI, clock, knownDaysAhead(clock, false), "en").label).toBe("Opens Monday at 12:35");
  });
});

describe("elixirStatus", () => {
  it("volgt de meting wanneer die vers is", () => {
    const result = elixirStatus(
      ELIXIR,
      brusselsWeekClock(TUE_2240),
      { phase: "evening", live: { isOpen: true, measuredAt: new Date("2026-10-20T20:38:00Z") } },
      "nl",
    );
    expect(result).toEqual({ state: "open", label: "Nu open", extra: "Live gemeten om 22:38" });
  });

  it("zegt na middernacht zonder meting enkel dat ze mogelijk nog open is", () => {
    const result = elixirStatus(ELIXIR, brusselsWeekClock(WED_0130), { phase: "after-midnight", live: null }, "nl");
    expect(result.state).toBe("maybe");
  });

  it("noemt overdag de opening van vanavond", () => {
    const result = elixirStatus(ELIXIR, brusselsWeekClock(TUE_1252), { phase: "closed", live: null }, "nl");
    expect(result).toMatchObject({ state: "closed", label: "Opent vanavond om 22:00" });
  });
});

describe("tijdlijn", () => {
  it("loopt van 9:00 tot 3:00 zodra er een avond zonder sluitingsuur is", () => {
    expect(timelineAxis([THEOKOT, CUDI, ELIXIR])).toEqual({ start: 540, end: 1620 });
    expect(timelineAxis([THEOKOT, CUDI])).toEqual({ start: 540, end: 1140 });
  });

  it("rekent de nacht nog bij gisteravond", () => {
    const moment = timelineMoment({ start: 540, end: 1620 }, brusselsWeekClock(WED_0130));
    expect(moment).toEqual({ day: 1, overnight: true, position: 1530, visible: true });
  });
});

describe("buildHoursBand", () => {
  const inputs: HoursServiceInput[] = [
    { key: "theokot", name: "Theokot", subtitle: "", note: "", week: THEOKOT, recurring: true },
    { key: "cursusdienst", name: "Cursusdienst", subtitle: "", note: "", week: CUDI, recurring: false },
    {
      key: "elixir",
      name: "'t ElixIr",
      subtitle: "",
      note: "",
      week: ELIXIR,
      recurring: true,
      elixir: { phase: "closed", live: null },
    },
  ];

  it("toont vandaag als tijdlijn en de week vanaf zondag", () => {
    const band = buildHoursBand(inputs, TUE_1252, "nl");
    expect(band.dayLabel).toBe("Vandaag · dinsdag");
    expect(band.now?.label).toBe("12:52");
    expect(band.nextWeek).toBe(false);

    const cudi = band.services[1];
    expect(cudi.bars.map((bar) => [bar.label, bar.active])).toEqual([
      ["12:30–14:00", true],
      ["18:00–19:00", false],
    ]);
    // Het label van het middagvenster zou op een telefoon tegen 18:00 lopen.
    expect(cudi.bars.map((bar) => bar.crowded)).toEqual([true, false]);
    expect(cudi.cells.map((cell) => cell.short)).toEqual(["Zo", "Ma", "Di", "Wo", "Do", "Vr"]);
    expect(cudi.cells.find((cell) => cell.today)?.lines).toEqual(["12:30–14:00", "18:00–19:00"]);

    const elixir = band.services[2];
    expect(elixir.bars.map((bar) => bar.kind)).toEqual(["open-end", "tail"]);
    expect(elixir.bars[1].tail).toBe("idle");
  });

  it("toont een cursusdienst zonder uren als niet beschikbaar", () => {
    const band = buildHoursBand(
      inputs.map((input) => (input.key === "cursusdienst" ? { ...input, week: null } : input)),
      TUE_1252,
      "nl",
    );
    expect(band.services[1]).toMatchObject({ unavailable: true, bars: [], cells: [] });
    expect(band.services[1].status.label).toBe("Uren niet beschikbaar");
  });
});

describe("elixirScheduleFromSetting", () => {
  it("leest dezelfde uren als de band, ook 22h-...", () => {
    const schedule = elixirScheduleFromSetting({
      entries: [{ dayNl: "Zondag", dayEn: "Sunday", hours: "22h-..." }],
    });
    expect(schedule[6]).toBe(1320);
  });
});
