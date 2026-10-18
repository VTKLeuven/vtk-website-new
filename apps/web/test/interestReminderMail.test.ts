import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/brevo/sync", () => ({ syncUserToBrevo: vi.fn() }));

import { interestReminderDue, interestReminderSendAt } from "@/lib/calendar/interestReminder";
import { interestReminderMail, type InterestReminderMailEvent } from "@/lib/calendar/interestReminderMail";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/mailUnsubscribe";

/** Alle momenten met hun Brusselse offset erbij, zodat de test overal hetzelfde zegt. */
describe("wanneer de herinnering vertrekt", () => {
  it("de dag ervoor om 12u Brusselse tijd", () => {
    expect(interestReminderSendAt(new Date("2026-10-20T20:00:00+02:00"))).toEqual(
      new Date("2026-10-19T12:00:00+02:00"),
    );
  });

  it("ook over de omschakeling naar wintertijd heen", () => {
    // Zondag 25 oktober 2026 springt de klok terug; maandag is het +01:00.
    expect(interestReminderSendAt(new Date("2026-10-26T20:00:00+01:00"))).toEqual(
      new Date("2026-10-25T12:00:00+01:00"),
    );
  });

  it("voor iets kort na middernacht nog de dag ervoor", () => {
    expect(interestReminderSendAt(new Date("2026-10-21T00:30:00+02:00"))).toEqual(
      new Date("2026-10-20T12:00:00+02:00"),
    );
  });

  const start = new Date("2026-10-20T20:00:00+02:00");
  const marked = new Date("2026-10-10T09:00:00+02:00");

  it("niet voor 12u, wel erna, en niet meer zodra het begonnen is", () => {
    expect(interestReminderDue({ start, createdAt: marked }, new Date("2026-10-19T11:55:00+02:00"))).toBe(false);
    expect(interestReminderDue({ start, createdAt: marked }, new Date("2026-10-19T12:05:00+02:00"))).toBe(true);
    // Lag de worker plat: later die dag kan nog.
    expect(interestReminderDue({ start, createdAt: marked }, new Date("2026-10-20T09:00:00+02:00"))).toBe(true);
    expect(interestReminderDue({ start, createdAt: marked }, new Date("2026-10-20T20:01:00+02:00"))).toBe(false);
  });

  it("niet voor wie pas na 12u interesse aanduidde", () => {
    const late = new Date("2026-10-19T15:00:00+02:00");
    expect(interestReminderDue({ start, createdAt: late }, new Date("2026-10-19T15:05:00+02:00"))).toBe(false);
  });
});

function event(overrides: Partial<InterestReminderMailEvent> = {}): InterestReminderMailEvent {
  return {
    title: "Galabal 2026",
    start: new Date("2026-11-14T20:00:00+01:00"),
    end: new Date("2026-11-15T03:00:00+01:00"),
    allDay: false,
    momentLabel: null,
    location: "Brabanthal",
    organiser: "Groep 3",
    imageUrl: "https://vtk.be/api/media/events/galabal.jpg",
    eventUrl: "https://vtk.be/kalender/galabal-2026",
    link: { label: "Tickets kopen", url: "https://vtk.be/tickets/galabal" },
    ...overrides,
  };
}

const common = {
  firstName: "Jan",
  unsubscribeUrl: "https://vtk.be/uitschrijven?t=abc",
  accountUrl: "https://vtk.be/account",
  logoUrl: "https://vtk.be/vtk-logo.png",
};

describe("de herinneringsmail", () => {
  it("noemt het evenement in het onderwerp en de uren in de tekst", () => {
    const mail = interestReminderMail({ ...common, locale: "nl", events: [event()] });
    expect(mail.subject).toBe("Morgen: Galabal 2026");
    expect(mail.text).toContain("Hey Jan,");
    expect(mail.text).toContain("20:00 tot 03:00, Brabanthal");
    expect(mail.text).toContain("Tickets kopen: https://vtk.be/tickets/galabal");
    expect(mail.html).toContain("https://vtk.be/api/media/events/galabal.jpg");
  });

  it("bundelt meerdere evenementen in één mail", () => {
    const mail = interestReminderMail({
      ...common,
      locale: "nl",
      events: [event(), event({ title: "Loopweek", momentLabel: "Nachtloop" }), event({ title: "Cantus" })],
    });
    expect(mail.subject).toBe("Morgen: Galabal 2026 en nog 2 evenementen");
    expect(mail.html).toContain("Loopweek: Nachtloop");
  });

  it("draagt altijd de uitschrijfknop en zegt waarom je de mail krijgt", () => {
    const mail = interestReminderMail({ ...common, locale: "nl", events: [event()] });
    expect(mail.html).toContain("Uitschrijven voor Evenementen");
    expect(mail.html).toContain("https://vtk.be/uitschrijven?t=abc");
    expect(mail.text).toContain("https://vtk.be/uitschrijven?t=abc");
    expect(mail.text).toContain("mailinglijst Evenementen");
  });

  it("spreekt Engels tegen een Engelstalig lid", () => {
    const mail = interestReminderMail({ ...common, locale: "en", events: [event({ allDay: true })] });
    expect(mail.subject).toBe("Tomorrow: Galabal 2026");
    expect(mail.text).toContain("All day");
    expect(mail.html).toContain("Unsubscribe from Events");
  });

  it("escapet wat een organisator intikte", () => {
    const mail = interestReminderMail({ ...common, locale: "nl", events: [event({ title: "<b>TD</b>" })] });
    expect(mail.html).not.toContain("<b>TD</b>");
    expect(mail.html).toContain("&lt;b&gt;TD&lt;/b&gt;");
  });
});

describe("de uitschrijflink", () => {
  it("zegt welk lid en welke lijst, en niets meer", () => {
    const token = createUnsubscribeToken("user123", "EVENEMENTEN");
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: "user123", category: "EVENEMENTEN" });
  });

  it("weigert een andere lijst of een ander lid met dezelfde handtekening", () => {
    const [prefix, , , signature] = createUnsubscribeToken("user123", "EVENEMENTEN").split(".");
    expect(verifyUnsubscribeToken(`${prefix}.user123.CAREER.${signature}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${prefix}.user456.EVENEMENTEN.${signature}`)).toBeNull();
    expect(verifyUnsubscribeToken("onzin")).toBeNull();
  });
});
