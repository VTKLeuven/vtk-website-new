import { describe, expect, it } from "vitest";
import {
  applyTicketTemplate,
  applyTicketTemplateType,
  blankTicketTemplateType,
  formatMinutesBefore,
  minutesBeforeFromDate,
  parseTemplateQuestions,
  parseTemplateTypes,
  templateCode,
  templateDesign,
  templateTimeOfDay,
  type TicketTemplateType,
} from "@/lib/ticketing/templates";

const DAY = 1_440;

function row(overrides: Partial<TicketTemplateType> = {}): TicketTemplateType {
  return { ...blankTicketTemplateType(1), nameNl: "Bierticket (Lid)", code: "BIERLID", ...overrides };
}

describe("een duur in woorden", () => {
  it("zegt dagen, uren en de start zelf", () => {
    expect(formatMinutesBefore(3 * DAY)).toBe("3 dagen vooraf");
    expect(formatMinutesBefore(DAY)).toBe("1 dag vooraf");
    expect(formatMinutesBefore(120)).toBe("2 uur vooraf");
    expect(formatMinutesBefore(0)).toBe("bij de start");
    expect(formatMinutesBefore(null)).toBe("niet ingesteld");
  });

  it("zegt het ook wanneer de verkoop pas na de start sluit", () => {
    expect(formatMinutesBefore(-60)).toBe("1 uur na de start");
  });
});

describe("het sjabloon op een datum zetten", () => {
  it("maakt van offsets datums", () => {
    const startsAt = new Date("2026-09-22T18:00:00.000Z");
    const schedule = applyTicketTemplate(
      { durationMinutes: 300, salesOpensMinutesBefore: 3 * DAY, salesClosesMinutesBefore: 0 },
      startsAt
    );
    expect(schedule.endsAt.toISOString()).toBe("2026-09-22T23:00:00.000Z");
    expect(schedule.salesStartAt?.toISOString()).toBe("2026-09-19T18:00:00.000Z");
    expect(schedule.salesEndAt?.toISOString()).toBe(startsAt.toISOString());
  });

  it("laat een tickettype zonder eigen venster het event volgen", () => {
    const startsAt = new Date("2026-09-22T18:00:00.000Z");
    expect(applyTicketTemplateType(row(), startsAt)).toEqual({
      salesStartAt: null,
      salesEndAt: null,
    });
    const own = applyTicketTemplateType(row({ salesOpensMinutesBefore: 60 }), startsAt);
    expect(own.salesStartAt?.toISOString()).toBe("2026-09-22T17:00:00.000Z");
  });

  // Een sjabloon dat in de zomer geschreven werd, moet in de winter nog altijd
  // "drie dagen vooraf" openen: het rekent in duur, niet in klokuren.
  it("houdt dezelfde duur over de winteruurwissel heen", () => {
    const startsAt = new Date("2026-11-03T20:00:00.000Z");
    const schedule = applyTicketTemplate(
      { durationMinutes: 300, salesOpensMinutesBefore: 3 * DAY, salesClosesMinutesBefore: 0 },
      startsAt
    );
    expect(schedule.salesStartAt?.toISOString()).toBe("2026-10-31T20:00:00.000Z");
  });

  it("gaat van een datum terug naar een duur", () => {
    const startsAt = new Date("2026-09-22T18:00:00.000Z");
    expect(minutesBeforeFromDate(startsAt, new Date("2026-09-19T18:00:00.000Z"))).toBe(3 * DAY);
    expect(minutesBeforeFromDate(startsAt, null)).toBeNull();
  });
});

describe("het startuur", () => {
  it("valt terug op 20:00 bij een leeg of onzinnig uur", () => {
    expect(templateTimeOfDay({ timeOfDay: "19:30" })).toBe("19:30");
    expect(templateTimeOfDay({ timeOfDay: null })).toBe("20:00");
    expect(templateTimeOfDay({ timeOfDay: "half acht" })).toBe("20:00");
  });
});

describe("de tickettypes lezen die een scherm terugstuurt", () => {
  it("houdt de volgorde en vult de standaardwaarden aan", () => {
    const parsed = parseTemplateTypes([
      { nameNl: "Bier (lid)", code: "BIERLID", unitPriceCents: 1400, audience: "MEMBERS" },
      { nameNl: "Bier (niet-lid)", code: "biernietlid", unitPriceCents: 1700 },
    ]);
    expect(Array.isArray(parsed)).toBe(true);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.map((type) => type.code)).toEqual(["BIERLID", "BIERNIETLID"]);
    expect(parsed[0].audience).toBe("MEMBERS");
    expect(parsed[1].audience).toBe("PUBLIC");
    expect(parsed[1].color).toBe("navy");
    expect(parsed[1].enabled).toBe(true);
  });

  it("aanvaardt een gratis ticket", () => {
    const parsed = parseTemplateTypes([{ nameNl: "Inschrijving", unitPriceCents: 0 }]);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed[0].unitPriceCents).toBe(0);
  });

  it("noemt de rij in de foutzin", () => {
    expect(
      parseTemplateTypes([{ nameNl: "Bier", unitPriceCents: 1400 }, { nameNl: "" }])
    ).toBe("Tickettype 2: geef het ticket een naam.");
  });

  it("weigert twee keer dezelfde code", () => {
    expect(
      parseTemplateTypes([
        { nameNl: "Bier", code: "BIER", unitPriceCents: 1400 },
        { nameNl: "Bier bis", code: "bier", unitPriceCents: 1700 },
      ])
    ).toBe("Tickettype 2: de code BIER staat al op een ander ticket.");
  });

  it("weigert een verkoop die sluit voor ze opent", () => {
    expect(
      parseTemplateTypes([
        {
          nameNl: "Bier",
          unitPriceCents: 1400,
          salesOpensMinutesBefore: 60,
          salesClosesMinutesBefore: 120,
        },
      ])
    ).toBe("Tickettype 1: de verkoop moet sluiten na ze opent.");
  });

  it("houdt een ledenprijs bij een ticket dat voor iedereen te koop staat", () => {
    const parsed = parseTemplateTypes([
      { nameNl: "Bier", unitPriceCents: 1700, memberPriceCents: 1400 },
    ]);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed[0].memberPriceCents).toBe(1400);
  });

  it("weigert een ledenprijs die niet lager ligt", () => {
    expect(
      parseTemplateTypes([{ nameNl: "Bier", unitPriceCents: 1400, memberPriceCents: 1400 }])
    ).toBe("Tickettype 1: de ledenprijs moet lager liggen dan de gewone prijs.");
  });

  it("laat de ledenprijs vallen bij een ticket voor leden alleen", () => {
    const parsed = parseTemplateTypes([
      { nameNl: "Bier (lid)", unitPriceCents: 1400, memberPriceCents: 1200, audience: "MEMBERS" },
    ]);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed[0].memberPriceCents).toBeNull();
  });

  it("overleeft de rondrit door het verborgen JSON-veld", () => {
    const original = [
      row({ code: "BIERLID", unitPriceCents: 1400, audience: "MEMBERS", maxPerOrder: 1 }),
      row({ code: "WATERLID", nameNl: "Water (lid)", unitPriceCents: 550, enabled: false }),
    ];
    const parsed = parseTemplateTypes(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });
});

describe("de vragen lezen die een scherm terugstuurt", () => {
  it("laat een lege lijst toe", () => {
    expect(parseTemplateQuestions(null)).toEqual([]);
    expect(parseTemplateQuestions([])).toEqual([]);
  });

  it("eist antwoordmogelijkheden bij een keuzevraag", () => {
    expect(
      parseTemplateQuestions([{ labelNl: "Welke bus?", type: "SINGLE_CHOICE", options: [] }])
    ).toBe("Vraag 1: een keuzevraag heeft minstens één antwoordmogelijkheid nodig.");
  });

  it("houdt de koppeling aan een tickettype op code", () => {
    const parsed = parseTemplateQuestions([
      { labelNl: "Allergieën?", type: "SHORT_TEXT", ticketTypeCode: "bierlid" },
    ]);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed[0].ticketTypeCode).toBe("BIERLID");
  });
});

describe("codes", () => {
  it("maakt er hoofdletters met underscores van", () => {
    expect(templateCode("bier lid", "X")).toBe("BIER_LID");
    expect(templateCode("  ", "TYPE_1")).toBe("TYPE_1");
  });
});

describe("het ticketontwerp in een sjabloon", () => {
  // Artwork en logo's staan per event in object storage; een gekopieerde key
  // hoort bij een ander event en laat het ontwerp stil terugvallen.
  it("houdt de kleuren en laat de afbeeldingen vallen", () => {
    expect(
      templateDesign({
        template: "CLASSIC",
        accentColor: "#F2B632",
        artwork: { key: "ticket-design/abc/1.png", focalX: 50, focalY: 50 },
        eventLogoKey: "ticket-design/abc/logo.png",
        footerNl: "Tot dan",
      })
    ).toEqual({ template: "CLASSIC", accentColor: "#F2B632", footerNl: "Tot dan" });
  });

  it("geeft niets terug voor een leeg ontwerp", () => {
    expect(templateDesign(null)).toBeNull();
    expect(templateDesign({})).toBeNull();
  });
});
