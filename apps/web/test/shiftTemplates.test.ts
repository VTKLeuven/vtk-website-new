import { describe, expect, it } from "vitest";
import {
  INHERIT_POST,
  NO_POST,
  composeName,
  formatTemplateDuration,
  formatTemplateOffset,
  parseTemplateEntries,
  templateClockAt,
  templateTimeOfDay,
  toDraftEntry,
  addDaysToYmd,
  getCurrentMonday,
  getNextMonday,
  getDatesBetween,
  formatDayLabel,
  type ShiftTemplateDraftEntry,
  type ShiftTemplateEntry,
} from "@/lib/shift/templates";

const POSTS = ["ACTIVITEITEN", "THEOKOT"];

function draft(overrides: Partial<ShiftTemplateDraftEntry> = {}): ShiftTemplateDraftEntry {
  return {
    name: "Tappen",
    startOffsetMinutes: 0,
    durationMinutes: 90,
    maxParticipants: 4,
    reward: 2,
    description: "Bier tappen",
    instructions: "",
    location: "",
    post: INHERIT_POST,
    openToInternationals: false,
    enabled: true,
    ...overrides,
  };
}

describe("het klokuur onder een offset", () => {
  it("telt de minuten op bij het standaarduur", () => {
    expect(templateClockAt("20:30", 0, true)).toBe("20:30");
    expect(templateClockAt("20:30", 90, true)).toBe("22:00");
  });

  it("zegt erbij dat een shift op de volgende dag valt", () => {
    // De afbraak van een cantus: 20:30 + 4 u 30.
    expect(templateClockAt("20:30", 270, true)).toBe("01:00 (+1 dag)");
    expect(templateClockAt("20:30", 270, false)).toBe("01:00 (+1 day)");
  });

  it("zegt erbij dat opbouw nog op de vorige dag valt", () => {
    expect(templateClockAt("00:30", -90, true)).toBe("23:00 (-1 dag)");
  });

  it("valt terug op 20:00 wanneer het sjabloon geen uur heeft", () => {
    expect(templateTimeOfDay({ timeOfDay: null })).toBe("20:00");
    expect(templateTimeOfDay({ timeOfDay: "kwart voor" })).toBe("20:00");
    expect(templateTimeOfDay({ timeOfDay: "10:30" })).toBe("10:30");
  });
});

describe("de offset in woorden", () => {
  it("schrijft voor, op en na de start uit", () => {
    expect(formatTemplateOffset(-150, true)).toBe("2 u 30 ervoor");
    expect(formatTemplateOffset(0, true)).toBe("op de start");
    expect(formatTemplateOffset(45, true)).toBe("45 min erna");
  });

  it("laat de nul-minuten weg bij een rond aantal uren", () => {
    expect(formatTemplateDuration(120, true)).toBe("2 u");
    expect(formatTemplateDuration(105, true)).toBe("1 u 45");
    expect(formatTemplateDuration(45, true)).toBe("45 min");
  });
});

describe("de shiftrijen nakijken", () => {
  it("zet de rijen chronologisch en houdt gelijke starts in hun volgorde", () => {
    const parsed = parseTemplateEntries(
      [
        draft({ name: "Afbraak", startOffsetMinutes: 270 }),
        draft({ name: "Tappen", startOffsetMinutes: 0 }),
        draft({ name: "Pispolitie", startOffsetMinutes: 0 }),
        draft({ name: "Opbouw", startOffsetMinutes: -90 }),
      ],
      POSTS,
    );
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as { name: string }[]).map((e) => e.name)).toEqual([
      "Opbouw",
      "Tappen",
      "Pispolitie",
      "Afbraak",
    ]);
  });

  it("noemt de rij waar iets aan ontbreekt", () => {
    expect(parseTemplateEntries([draft(), draft({ description: "  " })], POSTS)).toContain("Shift 2");
    expect(parseTemplateEntries([draft({ name: "" })], POSTS)).toContain("Shift 1");
  });

  it("weigert een shift die korter dan vijf minuten of zonder plaats is", () => {
    expect(typeof parseTemplateEntries([draft({ durationMinutes: 0 })], POSTS)).toBe("string");
    expect(typeof parseTemplateEntries([draft({ maxParticipants: 0 })], POSTS)).toBe("string");
    expect(typeof parseTemplateEntries([draft({ reward: -1 })], POSTS)).toBe("string");
  });

  it("aanvaardt nul bonnetjes; een korte shift hoeft er geen op te leveren", () => {
    const parsed = parseTemplateEntries([draft({ reward: 0 })], POSTS);
    expect((parsed as { reward: number }[])[0].reward).toBe(0);
  });

  it("weigert een post die deze gebruiker niet mag kiezen", () => {
    const parsed = parseTemplateEntries([draft({ post: "CURSUSDIENST" })], POSTS);
    expect(parsed).toContain("CURSUSDIENST");
  });

  it("houdt de drie posttoestanden uit elkaar", () => {
    const parsed = parseTemplateEntries(
      [
        draft({ name: "Volgt", post: INHERIT_POST }),
        draft({ name: "Geen", post: NO_POST }),
        draft({ name: "Vast", post: "THEOKOT" }),
      ],
      POSTS,
    ) as { ownPost: boolean; post: string | null }[];
    expect(parsed[0]).toMatchObject({ ownPost: false, post: null });
    expect(parsed[1]).toMatchObject({ ownPost: true, post: null });
    expect(parsed[2]).toMatchObject({ ownPost: true, post: "THEOKOT" });
  });

  it("maakt van lege tekstvelden null in plaats van een lege string", () => {
    const parsed = parseTemplateEntries([draft({ instructions: "  ", location: "" })], POSTS);
    expect((parsed as { instructions: string | null; location: string | null }[])[0]).toMatchObject({
      instructions: null,
      location: null,
    });
  });

  it("weigert iets dat helemaal geen lijst is", () => {
    expect(typeof parseTemplateEntries(null, POSTS)).toBe("string");
    expect(typeof parseTemplateEntries([null], POSTS)).toBe("string");
  });
});

describe("een bestaande shift terug in het formulier", () => {
  const stored: ShiftTemplateEntry = {
    id: "x",
    name: "Bijrijden",
    startOffsetMinutes: -150,
    durationMinutes: 60,
    maxParticipants: 2,
    reward: 1,
    description: "Materiaal ophalen",
    instructions: null,
    location: "De Loods",
    ownPost: false,
    post: null,
    openToInternationals: false,
    enabled: true,
  };

  it("gaat heen en terug zonder de posttoestand te verliezen", () => {
    expect(toDraftEntry(stored).post).toBe(INHERIT_POST);
    expect(toDraftEntry({ ...stored, ownPost: true, post: null }).post).toBe(NO_POST);
    expect(toDraftEntry({ ...stored, ownPost: true, post: "THEOKOT" }).post).toBe("THEOKOT");
  });

  it("levert een rij op die er ongewijzigd weer uit komt", () => {
    const parsed = parseTemplateEntries([toDraftEntry(stored)], POSTS);
    expect((parsed as unknown[])[0]).toMatchObject({
      name: "Bijrijden",
      startOffsetMinutes: -150,
      durationMinutes: 60,
      location: "De Loods",
      ownPost: false,
      post: null,
    });
  });
});

describe("de shiftnaam", () => {
  it("zet het evenement achter de shift, en laat het weg als het leeg is", () => {
    expect(composeName("Cantus", "Inkom")).toBe("Inkom - Cantus");
    expect(composeName("  ", "Inkom")).toBe("Inkom");
  });
});

describe("datumhulpjes voor terugkerende reeksen", () => {
  it("rekent de huidige en volgende maandag uit", () => {
    // 2026-09-24 is een donderdag.
    expect(getCurrentMonday("2026-09-24")).toBe("2026-09-21");
    expect(getNextMonday("2026-09-24")).toBe("2026-09-28");
    // Op een maandag zelf: huidige is vandaag, volgende is +7d.
    expect(getCurrentMonday("2026-09-21")).toBe("2026-09-21");
    expect(getNextMonday("2026-09-21")).toBe("2026-09-28");
  });

  it("telt dagen op bij YMD", () => {
    expect(addDaysToYmd("2026-09-28", 4)).toBe("2026-10-02");
    expect(addDaysToYmd("2026-09-28", -7)).toBe("2026-09-21");
  });

  it("geeft de juiste weekdagen terug tussen twee datums", () => {
    // Maandag 2026-09-28 tot vrijdag 2026-10-02, weekdagen 1..5 (Ma..Vr)
    const weekdays = [1, 2, 3, 4, 5];
    const dates = getDatesBetween("2026-09-28", "2026-10-02", weekdays);
    expect(dates).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);

    // Als woensdag niet actief is (bv. [1, 2, 4, 5])
    const noWed = getDatesBetween("2026-09-28", "2026-10-02", [1, 2, 4, 5]);
    expect(noWed).toEqual(["2026-09-28", "2026-09-29", "2026-10-01", "2026-10-02"]);
  });

  it("kapt een lang bereik niet stil af", () => {
    // 28/09 tot 20/12: twaalf volle weken van vijf weekdagen.
    expect(getDatesBetween("2026-09-28", "2026-12-20", [1, 2, 3, 4, 5])).toHaveLength(60);
    // Elke maandag tot eind januari.
    expect(getDatesBetween("2026-09-28", "2027-01-31", [1])).toHaveLength(18);
  });

  it("geeft niets terug als het einde voor het begin ligt", () => {
    expect(getDatesBetween("2026-10-02", "2026-09-28", [1, 2, 3, 4, 5])).toEqual([]);
  });

  it("formatteert de datumtitel kort", () => {
    expect(formatDayLabel("2026-09-28", "nl")).toContain("28");
    expect(formatDayLabel("2026-09-28", "en")).toContain("28");
  });
});
