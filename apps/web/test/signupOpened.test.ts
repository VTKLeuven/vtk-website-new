import { describe, expect, it } from "vitest";

import {
  formOpening,
  linkOpening,
  signupOpenedDue,
  ticketSaleOpening,
  type SignupTicketSale,
} from "@/lib/calendar/signupOpened";
import { signupOpenedMail, type SignupOpenedMailEvent } from "@/lib/calendar/signupOpenedMail";

const published = new Date("2026-11-01T10:00:00+01:00");
const salesStart = new Date("2026-11-10T20:00:00+01:00");
const eventStart = new Date("2026-12-01T20:00:00+01:00");
const marked = new Date("2026-11-05T12:00:00+01:00");

const sale: SignupTicketSale = {
  id: "sale1",
  status: "PUBLISHED",
  isPrivate: false,
  publishedAt: published,
  salesStartAt: salesStart,
  salesEndAt: null,
  presaleLeadMinutes: 60,
  presalePraesidium: true,
  presaleHelpers: true,
  presaleHonorary: true,
  presaleGroups: [],
};

const praesidium = { groups: [{ id: "g1", type: "PRAESIDIUM" }], completedShifts: 0, honorary: false };
const student = { groups: [], completedShifts: 0, honorary: false };

describe("wanneer een ticketverkoop opengaat", () => {
  it("bij de publieke start voor wie niet in de voorverkoop zit", () => {
    expect(ticketSaleOpening(sale, student)).toMatchObject({ opensAt: salesStart, presale: false, source: "ticket:sale1" });
  });

  it("bij de start van de voorverkoop voor wie erin mag", () => {
    expect(ticketSaleOpening(sale, praesidium)).toMatchObject({
      opensAt: new Date("2026-11-10T19:00:00+01:00"),
      presale: true,
    });
  });

  it("een erelid zit standaard in de voorverkoop", () => {
    expect(ticketSaleOpening(sale, { ...student, honorary: true })?.presale).toBe(true);
  });

  it("zonder verkoopstart bij het publiceren", () => {
    expect(ticketSaleOpening({ ...sale, salesStartAt: null }, student)?.opensAt).toEqual(published);
  });

  it("gepubliceerd na de start: voor iedereen bij het publiceren, zonder voorverkoop", () => {
    const late = new Date("2026-11-11T09:00:00+01:00");
    expect(ticketSaleOpening({ ...sale, publishedAt: late }, praesidium)).toMatchObject({ opensAt: late, presale: false });
  });

  it("niets voor een concept of een private verkoop", () => {
    expect(ticketSaleOpening({ ...sale, status: "DRAFT" }, student)).toBeNull();
    expect(ticketSaleOpening({ ...sale, isPrivate: true }, student)).toBeNull();
  });
});

describe("wanneer de mail vertrekt", () => {
  const opening = ticketSaleOpening(sale, student)!;

  it("vanaf het opengaan, tot 24 uur erna", () => {
    expect(signupOpenedDue({ opening, interestCreatedAt: marked, eventStart }, new Date("2026-11-10T19:55:00+01:00"))).toBe(false);
    expect(signupOpenedDue({ opening, interestCreatedAt: marked, eventStart }, new Date("2026-11-10T20:05:00+01:00"))).toBe(true);
    expect(signupOpenedDue({ opening, interestCreatedAt: marked, eventStart }, new Date("2026-11-11T19:55:00+01:00"))).toBe(true);
    expect(signupOpenedDue({ opening, interestCreatedAt: marked, eventStart }, new Date("2026-11-11T20:05:00+01:00"))).toBe(false);
  });

  it("niet voor wie pas interesse aanduidde toen het al open was", () => {
    const after = new Date("2026-11-10T20:01:00+01:00");
    expect(signupOpenedDue({ opening, interestCreatedAt: after, eventStart }, new Date("2026-11-10T20:05:00+01:00"))).toBe(false);
  });

  it("niet meer wanneer de verkoop al dicht is of het evenement begon", () => {
    const now = new Date("2026-11-10T20:05:00+01:00");
    expect(
      signupOpenedDue({ opening: { ...opening, closesAt: new Date("2026-11-10T20:04:00+01:00") }, interestCreatedAt: marked, eventStart }, now),
    ).toBe(false);
    expect(signupOpenedDue({ opening, interestCreatedAt: marked, eventStart: new Date("2026-11-10T20:00:00+01:00") }, now)).toBe(false);
  });
});

describe("formulier en inschrijflink", () => {
  it("een formulier opent op opensAt, of bij het publiceren", () => {
    const opens = new Date("2026-11-08T12:00:00+01:00");
    expect(formOpening({ status: "PUBLISHED", publishedAt: published, opensAt: opens, closesAt: null })?.opensAt).toEqual(opens);
    expect(formOpening({ status: "PUBLISHED", publishedAt: published, opensAt: null, closesAt: null })?.opensAt).toEqual(published);
    expect(formOpening({ status: "DRAFT", publishedAt: null, opensAt: opens, closesAt: null })).toBeNull();
  });

  it("een externe link enkel met het vinkje voor de inschrijvingen", () => {
    const ticked = new Date("2026-11-07T09:00:00+01:00");
    expect(linkOpening({ url: "https://example.org", registrationNewsAt: null, publishedAt: published })).toBeNull();
    expect(linkOpening({ url: "https://example.org", registrationNewsAt: ticked, publishedAt: published })?.opensAt).toEqual(ticked);
    expect(linkOpening({ url: null, registrationNewsAt: ticked, publishedAt: published })).toBeNull();
  });
});

describe("de mail", () => {
  const event: SignupOpenedMailEvent = {
    kind: "tickets",
    presalePublicStart: null,
    title: "Cantus",
    start: eventStart,
    end: new Date("2026-12-02T01:00:00+01:00"),
    allDay: false,
    momentLabel: null,
    location: "Theokot",
    organiser: "Onthaal",
    imageUrl: null,
    eventUrl: "https://vtk.be/kalender/cantus",
    link: { label: "Tickets kopen", url: "https://vtk.be/tickets/cantus" },
  };
  const base = {
    locale: "nl" as const,
    firstName: "An",
    unsubscribeUrl: "https://vtk.be/uitschrijven",
    accountUrl: "https://vtk.be/account",
    logoUrl: "https://vtk.be/vtk-logo.png",
  };

  it("zegt per soort wat er openging", () => {
    expect(signupOpenedMail({ ...base, events: [event] }).subject).toBe("Tickets voor Cantus zijn te koop");
    expect(signupOpenedMail({ ...base, events: [{ ...event, presalePublicStart: salesStart }] }).subject).toBe(
      "Je voorverkoop voor Cantus is begonnen",
    );
    expect(signupOpenedMail({ ...base, events: [{ ...event, kind: "form" }] }).subject).toBe(
      "Inschrijvingen voor Cantus zijn open",
    );
  });

  it("noemt bij een voorverkoop de publieke start", () => {
    const mail = signupOpenedMail({ ...base, events: [{ ...event, presalePublicStart: salesStart }] });
    expect(mail.text).toContain("Voorverkoop: voor iedereen open vanaf dinsdag 10 november om 20:00");
  });
});
