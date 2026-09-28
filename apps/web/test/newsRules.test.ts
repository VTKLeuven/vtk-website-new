import { describe, expect, it } from "vitest";
import {
  albumInNews,
  composeNews,
  groupNewsByPeriod,
  isFreshNews,
  magazinesInNews,
  postInNews,
  signupInNews,
  ticketInNews,
  ticketNewsDate,
  ticketPresaleInNews,
  ticketPresaleNewsDate,
  type NewsComposable,
} from "@/lib/news/rules";
import { defaultNewsSetting, readNewsFeatured, readNewsSetting } from "@/lib/news/setting";

/**
 * De regels van de Nieuws-band. "Nu" is zaterdag 26 september 2026 om 10u in
 * Brussel; alle momenten staan als UTC-offset zodat de test overal hetzelfde
 * antwoord geeft.
 */
const now = new Date("2026-09-26T10:00:00+02:00");
const at = (iso: string) => new Date(iso);

describe("ticketverkoop", () => {
  const base = {
    status: "PUBLISHED",
    startsAt: at("2026-11-27T21:00:00+01:00"),
    salesStartAt: at("2026-09-24T12:00:00+02:00"),
    salesEndAt: null,
    publishedAt: at("2026-09-20T12:00:00+02:00"),
  };

  it("staat erin vanaf de publieke start van de verkoop", () => {
    expect(ticketInNews(base, now)).toBe(true);
    expect(ticketNewsDate(base)).toEqual(base.salesStartAt);
  });

  it("wacht op een verkoop die nog moet openen", () => {
    expect(ticketInNews({ ...base, salesStartAt: at("2026-09-30T12:00:00+02:00") }, now)).toBe(false);
  });

  it("valt weg na twee weken", () => {
    const old = { ...base, salesStartAt: at("2026-09-11T12:00:00+02:00"), publishedAt: at("2026-09-01T12:00:00+02:00") };
    expect(ticketInNews(old, now)).toBe(false);
  });

  it("telt vanaf het publiceren wanneer dat na de verkoopstart kwam", () => {
    const late = { ...base, salesStartAt: at("2026-09-01T12:00:00+02:00"), publishedAt: at("2026-09-25T09:00:00+02:00") };
    expect(ticketNewsDate(late)).toEqual(late.publishedAt);
    expect(ticketInNews(late, now)).toBe(true);
  });

  it("valt weg wanneer de verkoop sluit, het event begint of het een concept is", () => {
    expect(ticketInNews({ ...base, salesEndAt: at("2026-09-25T12:00:00+02:00") }, now)).toBe(false);
    expect(ticketInNews({ ...base, startsAt: at("2026-09-25T21:00:00+02:00") }, now)).toBe(false);
    expect(ticketInNews({ ...base, status: "DRAFT" }, now)).toBe(false);
  });
});

describe("voorverkoop", () => {
  // Publieke verkoop maandag 28 september om 12u, voorverkoop drie dagen eerder.
  const presale = {
    status: "PUBLISHED",
    startsAt: at("2026-11-27T21:00:00+01:00"),
    salesStartAt: at("2026-09-28T12:00:00+02:00"),
    salesEndAt: null,
    publishedAt: at("2026-09-20T12:00:00+02:00"),
    presaleLeadMinutes: 3 * 24 * 60,
  };

  it("staat erin zolang de voorverkoop loopt", () => {
    expect(ticketPresaleInNews(presale, now)).toBe(true);
    expect(ticketPresaleNewsDate(presale)).toEqual(at("2026-09-25T12:00:00+02:00"));
  });

  it("valt nog niet voor de voorverkoop begint", () => {
    expect(ticketPresaleInNews({ ...presale, presaleLeadMinutes: 60 }, now)).toBe(false);
  });

  it("maakt plaats voor het gewone bericht zodra de publieke verkoop start", () => {
    const later = at("2026-09-28T13:00:00+02:00");
    expect(ticketPresaleInNews(presale, later)).toBe(false);
    expect(ticketInNews(presale, later)).toBe(true);
  });

  it("staat nooit in het gedeelde nieuws tijdens de voorverkoop", () => {
    expect(ticketInNews(presale, now)).toBe(false);
  });

  it("vraagt een echte voorverkoop", () => {
    expect(ticketPresaleInNews({ ...presale, presaleLeadMinutes: null }, now)).toBe(false);
    expect(ticketPresaleInNews({ ...presale, status: "DRAFT" }, now)).toBe(false);
    expect(ticketPresaleInNews({ ...presale, publishedAt: null }, now)).toBe(false);
  });
});

describe("inschrijvingen", () => {
  const base = {
    url: "https://skireis.be/inschrijven",
    start: at("2027-01-15T08:00:00+01:00"),
    registrationNewsAt: at("2026-09-23T12:00:00+02:00"),
    publishedAt: at("2026-09-20T12:00:00+02:00"),
  };

  it("staat erin van het aanduiden tot het evenement begint", () => {
    expect(signupInNews(base, now)).toBe(true);
    expect(signupInNews({ ...base, start: at("2026-09-26T09:00:00+02:00") }, now)).toBe(false);
  });

  it("vraagt een link, een aanduiding en een publicatie", () => {
    expect(signupInNews({ ...base, url: null }, now)).toBe(false);
    expect(signupInNews({ ...base, registrationNewsAt: null }, now)).toBe(false);
    expect(signupInNews({ ...base, publishedAt: null }, now)).toBe(false);
  });
});

describe("het Bakske en Ir.Reëel", () => {
  it("toont per blad enkel het nieuwste nummer", () => {
    const shown = magazinesInNews(
      [
        { id: "b1", kind: "bakske", publishedAt: "2026-09-18" },
        { id: "b2", kind: "bakske", publishedAt: "2026-09-25" },
        { id: "i1", kind: "ir-reeel", publishedAt: "2026-09-19" },
      ],
      now,
    );
    expect(shown.map((item) => item.id).sort()).toEqual(["b2", "i1"]);
  });

  it("laat een oud of nog niet verschenen nummer weg", () => {
    expect(magazinesInNews([{ id: "b1", kind: "bakske", publishedAt: "2026-08-01" }], now)).toEqual([]);
    expect(magazinesInNews([{ id: "b1", kind: "bakske", publishedAt: "2026-10-01" }], now)).toEqual([]);
    expect(magazinesInNews([{ id: "b1", kind: "bakske" }], now)).toEqual([]);
  });
});

describe("fotoalbums", () => {
  it("staat erin tot twee weken na de datum van het album", () => {
    expect(albumInNews({ date: "2026-09-22T20:00:00Z", updatedAt: null }, now)).toBe(true);
    expect(albumInNews({ date: "2026-09-01T20:00:00Z", updatedAt: null }, now)).toBe(false);
  });

  it("valt terug op de laatste wijziging zonder datum", () => {
    expect(albumInNews({ date: null, updatedAt: "2026-09-25T10:00:00Z" }, now)).toBe(true);
    expect(albumInNews({ date: null, updatedAt: null }, now)).toBe(false);
  });
});

describe("zelfgeschreven berichten", () => {
  it("volgen hun venster en hun schakelaar", () => {
    const post = { active: true, publishedAt: at("2026-09-21T09:00:00+02:00"), endsAt: null };
    expect(postInNews(post, now)).toBe(true);
    expect(postInNews({ ...post, active: false }, now)).toBe(false);
    expect(postInNews({ ...post, publishedAt: at("2026-09-27T09:00:00+02:00") }, now)).toBe(false);
    expect(postInNews({ ...post, endsAt: at("2026-09-25T09:00:00+02:00") }, now)).toBe(false);
  });
});

describe("samenstelling", () => {
  const entry = (
    key: string,
    source: NewsComposable["source"],
    date: string,
    featured = false,
    shownDate?: string,
  ) => ({
    key,
    source,
    date: at(date).toISOString(),
    ...(shownDate ? { shownDate: at(shownDate).toISOString() } : {}),
    featured,
  });
  const entries = [
    entry("bakske", "bakske", "2026-09-25T12:00:00Z"),
    entry("galabal", "tickets", "2026-09-24T12:00:00Z"),
    entry("album", "album", "2026-09-24T08:00:00Z"),
    entry("skireis", "signup", "2026-09-23T12:00:00Z"),
    entry("fiets", "notice", "2026-09-22T12:00:00Z"),
    entry("praeses", "praeses", "2026-09-21T12:00:00Z"),
    entry("irreeel", "irreeel", "2026-09-19T12:00:00Z"),
  ];

  it("licht het woordje van de praeses uit en zet de rest nieuwste eerst", () => {
    const { featured, rest } = composeNews(entries, now);
    expect(featured?.key).toBe("praeses");
    expect(rest.map((item) => item.key)).toEqual(["bakske", "galabal", "album", "skireis", "fiets", "irreeel"]);
  });

  it("toont alles: de carrousel heeft geen maximum", () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      entry(`album-${i}`, "album", `2026-09-${String(10 + i).padStart(2, "0")}T12:00:00Z`),
    );
    expect(composeNews(many, now).rest).toHaveLength(13);
  });

  it("zet de tegels in de volgorde van hun pin: eerst wat komt, het vroegste eerst", () => {
    const events = [
      entry("zesoktober", "tickets", "2026-09-25T10:00:00Z", false, "2026-10-06T20:00:00Z"),
      entry("eenoktober", "signup", "2026-09-24T10:00:00Z", false, "2026-10-01T20:00:00Z"),
      entry("morgen", "tickets", "2026-09-20T10:00:00Z", false, "2026-09-27T20:00:00Z"),
      entry("album", "album", "2026-09-24T08:00:00Z"),
      entry("fiets", "notice", "2026-09-25T09:00:00Z"),
      entry("praeses", "praeses", "2026-09-21T12:00:00Z"),
    ];
    const { rest } = composeNews(events, now);
    expect(rest.map((item) => item.key)).toEqual(["morgen", "eenoktober", "zesoktober", "fiets", "album"]);
  });

  it("volgt de keuze van de redactie boven het woordje", () => {
    const pinned = entries.map((item) => (item.key === "fiets" ? { ...item, featured: true } : item));
    expect(composeNews(pinned, now).featured?.key).toBe("fiets");
  });

  it("licht een automatisch bericht uit wanneer de redactie het kiest", () => {
    const pinned = entries.map((item) => (item.key === "galabal" ? { ...item, featured: true } : item));
    const { featured, rest } = composeNews(pinned, now);
    expect(featured?.key).toBe("galabal");
    expect(rest.map((item) => item.key)).toEqual(["bakske", "album", "skireis", "fiets", "praeses", "irreeel"]);
  });

  it("licht zonder woordje het nieuwste bericht uit", () => {
    const withoutPraeses = entries.filter((item) => item.source !== "praeses");
    expect(composeNews(withoutPraeses, now).featured?.key).toBe("bakske");
  });

  it("toont niets zonder berichten", () => {
    expect(composeNews([], now)).toEqual({ featured: null, rest: [] });
  });
});

describe("nieuw", () => {
  it("draagt het label tot twee dagen na de datum", () => {
    expect(isFreshNews("2026-09-25T12:00:00Z", now)).toBe(true);
    expect(isFreshNews("2026-09-21T12:00:00Z", now)).toBe(false);
  });
});

describe("de instelling", () => {
  it("staat standaard aan met alle bronnen", () => {
    expect(readNewsSetting(undefined)).toEqual(defaultNewsSetting());
  });

  it("negeert een oud aantal berichten en vult ontbrekende bronnen aan", () => {
    const setting = readNewsSetting({ enabled: false, count: 4, sources: { album: false } });
    expect(setting).not.toHaveProperty("count");
    expect(setting.enabled).toBe(false);
    expect(setting.sources.album).toBe(false);
    expect(setting.sources.tickets).toBe(true);
  });
});

describe("uitgelicht automatisch bericht", () => {
  it("leest een geldige keuze", () => {
    expect(readNewsFeatured({ source: "tickets", ref: "abc" })).toEqual({ source: "tickets", ref: "abc" });
  });

  it("negeert wat geen automatisch bericht is", () => {
    expect(readNewsFeatured(undefined)).toBeNull();
    expect(readNewsFeatured({ source: "notice", ref: "abc" })).toBeNull();
    expect(readNewsFeatured({ source: "tickets", ref: "" })).toBeNull();
    expect(readNewsFeatured(["tickets", "abc"])).toBeNull();
  });
});

describe("/nieuws per periode", () => {
  // "Nu" is zaterdag 26 september 2026 om 10u: deze week loopt van maandag 21
  // tot zondag 27 september.
  const entry = (key: string, date: string, shownDate?: string) => ({
    key,
    date: at(date).toISOString(),
    ...(shownDate ? { shownDate: at(shownDate).toISOString() } : {}),
  });
  const shape = (groups: ReturnType<typeof groupNewsByPeriod<ReturnType<typeof entry>>>) =>
    groups.map((group) => [group.key, group.monday, group.entries.map((e) => e.key)]);

  it("deelt in in deze week, vorige week en daarvoor per maand, recentste eerst", () => {
    const groups = groupNewsByPeriod(
      [
        entry("zaterdag", "2026-09-26T09:00:00+02:00"),
        entry("maandag", "2026-09-21T00:30:00+02:00"),
        entry("zondag ervoor", "2026-09-20T23:30:00+02:00"),
        entry("vorige maandag", "2026-09-14T08:00:00+02:00"),
        entry("begin september", "2026-09-02T12:00:00+02:00"),
        entry("augustus", "2026-08-20T12:00:00+02:00"),
      ],
      now,
    );
    expect(shape(groups)).toEqual([
      ["this-week", "2026-09-21", ["zaterdag", "maandag"]],
      ["last-week", "2026-09-14", ["zondag ervoor", "vorige maandag"]],
      ["earlier-2026-09", null, ["begin september"]],
      ["earlier-2026-08", null, ["augustus"]],
    ]);
  });

  it("zet een ticketverkoop bij de dag van het evenement, niet bij de start van de verkoop", () => {
    const groups = groupNewsByPeriod(
      [
        entry("cantus", "2026-09-18T12:00:00+02:00", "2026-09-27T20:00:00+02:00"),
        entry("sector night", "2026-09-24T12:00:00+02:00", "2026-10-01T19:00:00+02:00"),
        entry("galabal", "2026-09-20T12:00:00+02:00", "2026-11-27T21:00:00+01:00"),
        entry("skireis", "2026-09-22T12:00:00+02:00", "2026-10-20T08:00:00+02:00"),
        entry("woordje", "2026-09-22T12:00:00+02:00"),
        entry("bakske", "2026-09-15T12:00:00+02:00"),
      ],
      now,
    );
    // Eerst wat komt, het vroegste eerst; dan wat voorbij is, het recentste eerst.
    expect(shape(groups)).toEqual([
      ["this-week", "2026-09-21", ["cantus", "woordje"]],
      ["next-week", "2026-09-28", ["sector night"]],
      ["later-2026-10", null, ["skireis"]],
      ["later-2026-11", null, ["galabal"]],
      ["last-week", "2026-09-14", ["bakske"]],
    ]);
  });
});
