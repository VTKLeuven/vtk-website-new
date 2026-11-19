import { describe, expect, it } from "vitest";

import {
  dueWeekOverview,
  excerpt,
  occurrenceInWeek,
  pickWeekFeatured,
  visibleForAudiences,
  weekOverviewRange,
  weekOverviewSendAt,
} from "@/lib/calendar/weekOverview";
import { weekOverviewMail, type WeekOverviewMailEvent } from "@/lib/calendar/weekOverviewMail";

describe("wanneer de weekmail vertrekt", () => {
  it("zaterdag om 19u over de week die maandag begint", () => {
    expect(weekOverviewSendAt("2026-11-23")).toEqual(new Date("2026-11-21T19:00:00+01:00"));
  });

  it("niet voor zaterdag 19u", () => {
    expect(dueWeekOverview(new Date("2026-11-21T18:59:00+01:00"))).toBeNull();
    expect(dueWeekOverview(new Date("2026-11-20T21:00:00+01:00"))).toBeNull();
  });

  it("vanaf zaterdag 19u tot zondagavond over dezelfde week", () => {
    expect(dueWeekOverview(new Date("2026-11-21T19:00:00+01:00"))?.week).toBe("2026-11-23");
    expect(dueWeekOverview(new Date("2026-11-22T10:00:00+01:00"))?.week).toBe("2026-11-23");
    expect(dueWeekOverview(new Date("2026-11-22T23:59:00+01:00"))?.week).toBe("2026-11-23");
  });

  it("nooit meer zodra de week begonnen is", () => {
    expect(dueWeekOverview(new Date("2026-11-23T00:01:00+01:00"))).toBeNull();
  });

  it("rekent op de Brusselse klok, niet op UTC", () => {
    // Zondag 00:30 in Brussel is nog zaterdag 23:30 UTC: dezelfde week, en op tijd.
    expect(dueWeekOverview(new Date("2026-11-22T00:30:00+01:00"))?.week).toBe("2026-11-23");
    expect(dueWeekOverview(new Date("2026-11-21T23:30:00+01:00"))?.week).toBe("2026-11-23");
  });

  it("over de omschakeling naar wintertijd heen", () => {
    // Zondag 25 oktober 2026 springt de klok terug.
    expect(weekOverviewSendAt("2026-10-26")).toEqual(new Date("2026-10-24T19:00:00+02:00"));
    const range = weekOverviewRange("2026-10-26");
    expect(range.start).toEqual(new Date("2026-10-26T00:00:00+01:00"));
    expect(range.end).toEqual(new Date("2026-11-02T00:00:00+01:00"));
  });
});

describe("wat er in de week staat", () => {
  const range = weekOverviewRange("2026-11-23");

  it("een evenement dat in de week begint", () => {
    const event = { start: new Date("2026-11-24T20:00:00+01:00"), end: new Date("2026-11-25T01:00:00+01:00"), moments: [] };
    expect(occurrenceInWeek(event, range)).toMatchObject({ moment: null, more: 0 });
  });

  it("niet wat al vóór maandag begon of na zondag begint", () => {
    const before = { start: new Date("2026-11-22T20:00:00+01:00"), end: new Date("2026-11-24T01:00:00+01:00"), moments: [] };
    const after = { start: new Date("2026-11-30T00:00:00+01:00"), end: new Date("2026-11-30T02:00:00+01:00"), moments: [] };
    expect(occurrenceInWeek(before, range)).toBeNull();
    expect(occurrenceInWeek(after, range)).toBeNull();
  });

  it("een reeks één keer, op het eerste moment in de week", () => {
    const moment = (iso: string) => ({ start: new Date(iso), end: new Date(new Date(iso).getTime() + 3_600_000) });
    const event = {
      start: new Date("2026-11-20T08:00:00+01:00"),
      end: new Date("2026-11-27T09:00:00+01:00"),
      moments: [moment("2026-11-27T08:00:00+01:00"), moment("2026-11-20T08:00:00+01:00"), moment("2026-11-25T08:00:00+01:00")],
    };
    const occurrence = occurrenceInWeek(event, range);
    expect(occurrence?.start).toEqual(new Date("2026-11-25T08:00:00+01:00"));
    expect(occurrence?.more).toBe(1);
  });

  it("uitgelicht gaat voor, dan wat een inschrijving heeft, dan het eerste", () => {
    expect(pickWeekFeatured([{ id: 1, featured: false, hasSignup: false }, { id: 2, featured: false, hasSignup: true }, { id: 3, featured: true, hasSignup: false }])?.id).toBe(3);
    expect(pickWeekFeatured([{ id: 1, featured: false, hasSignup: false }, { id: 2, featured: false, hasSignup: true }])?.id).toBe(2);
    expect(pickWeekFeatured([{ id: 1, featured: false, hasSignup: false }])?.id).toBe(1);
    expect(pickWeekFeatured([])).toBeNull();
  });

  it("de doelgroepfilter zoals op de kalender", () => {
    expect(visibleForAudiences(["FIRST_YEARS"], null)).toBe(true);
    expect(visibleForAudiences([null], [])).toBe(true);
    expect(visibleForAudiences(["FIRST_YEARS"], [])).toBe(false);
    expect(visibleForAudiences(["FIRST_YEARS", "ALUMNI"], ["ALUMNI"])).toBe(true);
    expect(visibleForAudiences(["CUSTOM"], [])).toBe(true);
  });

  it("een korte tekst breekt af op een woord", () => {
    expect(excerpt("  kort  ")).toBe("kort");
    expect(excerpt("")).toBeNull();
    const long = excerpt("woord ".repeat(80), 40)!;
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long.endsWith("woord…")).toBe(true);
  });
});

describe("het bericht", () => {
  const event = (overrides: Partial<WeekOverviewMailEvent>): WeekOverviewMailEvent => ({
    title: "Winter-TD",
    start: new Date("2026-11-26T22:00:00+01:00"),
    end: new Date("2026-11-27T04:00:00+01:00"),
    allDay: false,
    momentLabel: null,
    location: "Recup",
    organiser: "Feest",
    imageUrl: "https://vtk.be/api/media/images/td.jpg",
    eventUrl: "https://vtk.be/kalender/winter-td-2026",
    link: { label: "Tickets kopen", url: "https://vtk.be/tickets/winter-td" },
    moreThisWeek: 0,
    excerpt: null,
    ...overrides,
  });
  const base = {
    locale: "nl" as const,
    weekStart: new Date("2026-11-23T00:00:00+01:00"),
    reminders: [],
    calendarUrl: "https://vtk.be/kalender",
    unsubscribeUrl: "https://vtk.be/uitschrijven?t=abc",
    accountUrl: "https://vtk.be/account",
    logoUrl: "https://vtk.be/vtk-logo.png",
  };

  it("het onderwerp noemt het uitgelichte evenement en hoeveel er nog zijn", () => {
    const mail = weekOverviewMail({ ...base, featured: event({}), others: [event({ title: "Cantus" }), event({ title: "Quiz" })] });
    expect(mail.subject).toBe("Donderdag: Winter-TD, en nog 2 activiteiten deze week");
    expect(mail.html).toContain("Verder deze week");
    expect(mail.html).toContain("Ook deze week: Cantus en Quiz.");
  });

  it("zonder andere evenementen geen lijst", () => {
    const mail = weekOverviewMail({ ...base, featured: event({}), others: [] });
    expect(mail.subject).toBe("Donderdag: Winter-TD");
    expect(mail.html).not.toContain("Verder deze week");
  });

  it("in het Engels voor een Engelstalig lid", () => {
    const mail = weekOverviewMail({ ...base, locale: "en", featured: event({}), others: [event({ title: "Cantus" })] });
    expect(mail.subject).toBe("Thursday: Winter-TD, and 1 more event this week");
    expect(mail.text).toContain("Unsubscribe from the Events mailing list: https://vtk.be/uitschrijven?t=abc");
  });

  it("escapet wat een redacteur intikte", () => {
    const mail = weekOverviewMail({ ...base, featured: event({ title: "<b>TD</b>" }), others: [] });
    expect(mail.html).not.toContain("<b>TD</b>");
    expect(mail.html).toContain("&lt;b&gt;TD&lt;/b&gt;");
  });

  it("draagt de uitschrijflink en Niet vergeten", () => {
    const mail = weekOverviewMail({
      ...base,
      featured: event({}),
      others: [],
      reminders: [{ kind: "ticketSale", at: new Date("2026-11-25T12:00:00+01:00"), title: "Galabal", url: "https://vtk.be/tickets/galabal" }],
    });
    expect(mail.html).toContain("https://vtk.be/uitschrijven?t=abc");
    expect(mail.html).toContain("Ticketverkoop opent: Galabal");
    expect(mail.text).toContain("Wo 25 nov, 12:00: Ticketverkoop opent: Galabal");
  });
});
