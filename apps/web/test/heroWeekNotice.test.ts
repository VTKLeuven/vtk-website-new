import { describe, expect, it } from "vitest";
import {
  heroWeekNoticeReasons,
  inHeroWeekWindow,
  needsHeroWeekNotice,
  type HeroWeekNoticeInput,
} from "@/lib/calendar/heroWeekNotice";
import { heroWeekNoticeMail } from "@/lib/calendar/heroWeekNoticeMail";
import { derivedGroupMailAddress } from "@/lib/groupMail";

/**
 * Alle momenten staan in Brusselse tijd met hun offset erbij, zodat de test
 * hetzelfde antwoord geeft op een laptop en op de server. Zondag 13 september
 * 2026 is "vandaag" in deze tests; het venster loopt dan tot en met zaterdag
 * 19 september, maar die zaterdag valt weg.
 */
const sunday13 = new Date("2026-09-13T10:00:00+02:00");

function event(overrides: Partial<HeroWeekNoticeInput> = {}): HeroWeekNoticeInput {
  const start = new Date("2026-09-17T20:00:00+02:00");
  return {
    id: "evt",
    start,
    end: new Date(start.getTime() + 3 * 60 * 60 * 1000),
    allDay: false,
    heroWeek: "AUTO",
    publishedAt: null,
    imageKey: null,
    heroWeekNoticeAt: null,
    ...overrides,
  };
}

describe("wanneer de post een herinnering verdient", () => {
  it("noemt eerst het concept en dan de banner", () => {
    expect(heroWeekNoticeReasons({ publishedAt: null, imageKey: null })).toEqual([
      "draft",
      "banner",
    ]);
    expect(heroWeekNoticeReasons({ publishedAt: sunday13, imageKey: null })).toEqual(["banner"]);
    expect(heroWeekNoticeReasons({ publishedAt: null, imageKey: "events/a.jpg" })).toEqual([
      "draft",
    ]);
    expect(heroWeekNoticeReasons({ publishedAt: sunday13, imageKey: "events/a.jpg" })).toEqual([]);
  });

  it("wacht tot het evenement in het venster van de hero valt", () => {
    // Het venster is dat van het weekoverzicht zelf: zes dagen vanaf vandaag,
    // zaterdag niet meegeteld. Wat verder weg staat, is nog geen haast.
    const soon = event();
    const later = event({
      start: new Date("2026-09-25T20:00:00+02:00"),
      end: new Date("2026-09-25T23:00:00+02:00"),
    });
    expect(needsHeroWeekNotice(soon, sunday13)).toBe(true);
    expect(needsHeroWeekNotice(later, sunday13)).toBe(false);
  });

  it("loopt een dag verder wanneer de zondag leeg is, en telt een zondag met dit evenement", () => {
    // Vanaf woensdag 16: zaterdag valt weg en een lege zondag ook, dus woensdag
    // 23 valt in het venster. Staat het evenement zelf op zondag 20, dan blijft
    // die zondag staan.
    const wednesday16 = new Date("2026-09-16T08:00:00+02:00");
    const nextWednesday = event({
      start: new Date("2026-09-23T20:00:00+02:00"),
      end: new Date("2026-09-23T23:00:00+02:00"),
    });
    const sunday = event({
      start: new Date("2026-09-20T14:00:00+02:00"),
      end: new Date("2026-09-20T17:00:00+02:00"),
    });
    expect(inHeroWeekWindow(nextWednesday, wednesday16)).toBe(true);
    expect(inHeroWeekWindow(sunday, wednesday16)).toBe(true);
  });

  it("telt een meerdaags evenement zodra één van zijn dagen meetelt", () => {
    // Begint buiten het venster, loopt er wel doorheen.
    const long = event({
      start: new Date("2026-09-11T09:00:00+02:00"),
      end: new Date("2026-09-16T18:00:00+02:00"),
    });
    expect(inHeroWeekWindow(long, sunday13)).toBe(true);
  });

  it("laat een evenement met losse momenten op zijn eigen dagen meetellen", () => {
    const week = event({
      start: new Date("2026-09-14T18:00:00+02:00"),
      end: new Date("2026-09-30T19:00:00+02:00"),
      moments: [
        { start: new Date("2026-09-14T18:00:00+02:00"), end: new Date("2026-09-14T19:00:00+02:00") },
        { start: new Date("2026-09-30T18:00:00+02:00"), end: new Date("2026-09-30T19:00:00+02:00") },
      ],
    });
    expect(inHeroWeekWindow(week, sunday13)).toBe(true);
  });

  it("zwijgt over een evenement dat bewust uit het weekoverzicht gehaald is", () => {
    // Dan is "het komt bijna op de homepage" gewoon onjuist.
    expect(needsHeroWeekNotice(event({ heroWeek: "HIDDEN" }), sunday13)).toBe(false);
  });

  it("stuurt niets voor een evenement dat al in orde is of al bericht kreeg", () => {
    expect(
      needsHeroWeekNotice(event({ publishedAt: sunday13, imageKey: "events/a.jpg" }), sunday13),
    ).toBe(false);
    expect(needsHeroWeekNotice(event({ heroWeekNoticeAt: sunday13 }), sunday13)).toBe(false);
  });

  it("stuurt niets meer wanneer het evenement voorbij is", () => {
    // Het venster kan gisteren tonen, maar daar valt niets meer te redden.
    const past = event({
      start: new Date("2026-09-12T20:00:00+02:00"),
      end: new Date("2026-09-12T23:00:00+02:00"),
    });
    expect(needsHeroWeekNotice(past, sunday13)).toBe(false);
  });
});

describe("het adres van de post", () => {
  it("volgt de regel post@vtk.be", () => {
    expect(derivedGroupMailAddress("ONTHAAL")).toBe("onthaal@vtk.be");
    // Streepjes en spaties horen niet in een adres: GROEP5, niet groep-5.
    expect(derivedGroupMailAddress("GROEP5")).toBe("groep5@vtk.be");
    expect(derivedGroupMailAddress("  ")).toBeNull();
  });
});

describe("de herinneringsmail zelf", () => {
  const base = {
    title: "Openingscantus",
    start: new Date("2026-09-17T20:00:00+02:00"),
    allDay: false,
    location: "Theokot",
    groupName: "Onthaal",
    adminUrl: "https://vtk.be/admin/kalender/evt",
    publicUrl: null,
    logoUrl: "https://vtk.be/vtk-logo.png",
  };

  it("zegt in het onderwerp wat er ontbreekt", () => {
    const draft = heroWeekNoticeMail({ ...base, reasons: ["draft"] });
    expect(draft.subject).toBe(
      "Je evenement komt dichterbij maar staat nog als concept opgeslagen: Openingscantus",
    );
    const banner = heroWeekNoticeMail({ ...base, reasons: ["banner"] });
    expect(banner.subject).toContain("heeft nog geen banner");
    const both = heroWeekNoticeMail({ ...base, reasons: ["draft", "banner"] });
    expect(both.subject).toContain("staat nog als concept opgeslagen en heeft nog geen banner");
  });

  it("draagt de datum, de plaats en de knop naar de admin", () => {
    const mail = heroWeekNoticeMail({ ...base, reasons: ["draft", "banner"] });
    expect(mail.html).toContain("donderdag 17 september 2026, 20:00");
    expect(mail.html).toContain("Theokot");
    expect(mail.html).toContain("https://vtk.be/admin/kalender/evt");
    expect(mail.text).toContain("https://vtk.be/admin/kalender/evt");
    // Een concept heeft geen publieke pagina, dus ook geen knop ernaartoe.
    expect(mail.html).not.toContain("Bekijk de eventpagina");
  });

  it("zet de knop naar de eventpagina er enkel bij wanneer die bestaat", () => {
    const mail = heroWeekNoticeMail({
      ...base,
      reasons: ["banner"],
      publicUrl: "https://vtk.be/kalender/openingscantus-2026",
    });
    expect(mail.html).toContain("Bekijk de eventpagina");
    expect(mail.text).toContain("https://vtk.be/kalender/openingscantus-2026");
  });

  it("laat het uur weg bij een heledagevenement", () => {
    const mail = heroWeekNoticeMail({ ...base, allDay: true, reasons: ["banner"] });
    expect(mail.html).toContain("donderdag 17 september 2026");
    expect(mail.html).not.toContain("20:00");
  });
});
