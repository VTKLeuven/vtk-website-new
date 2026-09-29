import { describe, expect, it } from "vitest";

import {
  eventPageTicketLabel,
  eventPageTickets,
  publishedTicketSlug,
  separateTicketPages,
  ticketTimeRange,
  type EventPageTicket,
} from "@/lib/ticketing/eventPage";

function ticket(overrides: Partial<EventPageTicket>): EventPageTicket {
  return {
    id: overrides.slug ?? "t",
    slug: "t",
    status: "PUBLISHED",
    isPrivate: false,
    onEventPage: true,
    labelNl: null,
    labelEn: null,
    ownTimes: false,
    startsAt: new Date("2026-10-01T10:00:00Z"),
    endsAt: new Date("2026-10-01T22:00:00Z"),
    createdAt: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  };
}

describe("eventPageTickets", () => {
  it("toont enkel gepubliceerde verkopen die op de eventpagina staan", () => {
    const list = [
      ticket({ slug: "volledig" }),
      ticket({ slug: "concept", status: "DRAFT" }),
      ticket({ slug: "apart", onEventPage: false }),
    ];
    expect(eventPageTickets(list).map((t) => t.slug)).toEqual(["volledig"]);
    expect(separateTicketPages(list).map((t) => t.slug)).toEqual(["apart"]);
  });

  it("laat een privéverkoop weg, als tab en als knop", () => {
    const list = [
      ticket({ slug: "volledig" }),
      ticket({ slug: "sponsortafel", isPrivate: true }),
      ticket({ slug: "weekend", isPrivate: true, onEventPage: false }),
    ];
    expect(eventPageTickets(list).map((t) => t.slug)).toEqual(["volledig"]);
    expect(separateTicketPages(list)).toEqual([]);
  });

  it("zet ze op uur, en bij hetzelfde uur op volgorde van aanmaken", () => {
    const list = [
      ticket({ slug: "apart", createdAt: new Date("2026-09-10T10:00:00Z") }),
      ticket({ slug: "eerstejaars", startsAt: new Date("2026-10-01T09:00:00Z") }),
      ticket({ slug: "volledig", createdAt: new Date("2026-09-02T10:00:00Z") }),
    ];
    expect(eventPageTickets(list).map((t) => t.slug)).toEqual(["eerstejaars", "volledig", "apart"]);
  });
});

describe("publishedTicketSlug", () => {
  it("geeft de eerste gepubliceerde verkoop, of niets", () => {
    expect(publishedTicketSlug([])).toBeNull();
    expect(publishedTicketSlug(null)).toBeNull();
    expect(publishedTicketSlug([ticket({ slug: "concept", status: "DRAFT" })])).toBeNull();
    expect(
      publishedTicketSlug([
        ticket({ slug: "later", startsAt: new Date("2026-10-01T12:00:00Z") }),
        ticket({ slug: "vroeger", startsAt: new Date("2026-10-01T09:00:00Z"), onEventPage: false }),
      ]),
    ).toBe("vroeger");
  });

  it("geeft nooit een privéverkoop, ook niet als ze de eerste is", () => {
    expect(publishedTicketSlug([ticket({ slug: "prive", isPrivate: true })])).toBeNull();
    expect(
      publishedTicketSlug([
        ticket({ slug: "prive", isPrivate: true, startsAt: new Date("2026-10-01T09:00:00Z") }),
        ticket({ slug: "openbaar", startsAt: new Date("2026-10-01T12:00:00Z") }),
      ]),
    ).toBe("openbaar");
  });
});

describe("eventPageTicketLabel", () => {
  it("gebruikt de naam, in het Engels met terugval op het Nederlands", () => {
    expect(eventPageTicketLabel(ticket({ labelNl: "Volledige 12u" }), "nl", 0)).toBe("Volledige 12u");
    expect(eventPageTicketLabel(ticket({ labelNl: "Volledige 12u" }), "en", 0)).toBe("Volledige 12u");
    expect(
      eventPageTicketLabel(ticket({ labelNl: "Volledige 12u", labelEn: "Full 12 hours" }), "en", 0),
    ).toBe("Full 12 hours");
  });

  it("valt zonder naam terug op het uur bij eigen uren, en anders op een nummer", () => {
    expect(
      eventPageTicketLabel(
        ticket({ ownTimes: true, startsAt: new Date("2026-10-01T17:00:00Z") }),
        "nl",
        0,
      ),
    ).toBe("19:00");
    expect(eventPageTicketLabel(ticket({}), "nl", 1)).toBe("Tickets 2");
  });

  it("schrijft het uur in Brussel", () => {
    expect(
      ticketTimeRange(
        { startsAt: new Date("2026-10-01T17:00:00Z"), endsAt: new Date("2026-10-01T22:00:00Z") },
        "nl",
      ),
    ).toBe("19:00 - 00:00");
  });
});
