import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKET_DESIGN,
  parseTicketDesignDraft,
  publishedTicketDesign,
  ticketDesignSnapshot,
  withCurrentDefaultColours,
} from "@/lib/ticketing/design";
import { A4_PORTRAIT_POINTS, generateTicketsPdf } from "@/lib/ticketing/pdf";

describe("ticket design validation", () => {
  it("uses the print-safe Classic defaults when no design was published", () => {
    expect(publishedTicketDesign({}, "event-1")).toMatchObject({
      ...DEFAULT_TICKET_DESIGN,
      revision: 1,
    });
  });

  it("only accepts assets owned by the event", () => {
    expect(() => parseTicketDesignDraft({
      artwork: { key: "ticket-design/another-event/secret.jpg" },
    }, "event-1")).toThrow("INVALID_TICKET_DESIGN_ASSET");
    expect(parseTicketDesignDraft({
      artwork: { key: "ticket-design/event-1/artwork.jpg", focalX: 10, focalY: 90 },
      backgroundColor: "#010203",
      accentColor: "#AABBCC",
      textColor: "#102030",
    }, "event-1")).toMatchObject({ artwork: { focalX: 10, focalY: 90 } });
  });

  it("falls back for malformed or foreign ticket snapshots", () => {
    expect(ticketDesignSnapshot({ revision: "not-a-number" }, "event-1")).toMatchObject({ template: "CLASSIC", revision: 1 });
    expect(ticketDesignSnapshot({
      ...DEFAULT_TICKET_DESIGN,
      eventLogoKey: "ticket-design/other/logo.png",
      revision: 3,
      publishedAt: "2027-01-01T00:00:00.000Z",
    }, "event-1")).toMatchObject({ template: "CLASSIC", revision: 1 });
  });

  // The admin preview renders an unpublished draft as revision 0. Rejecting
  // that made every preview fall back to the default design, so the editor
  // showed the same ticket no matter what anyone changed.
  it("keeps a revision 0 draft preview instead of falling back to the default", () => {
    expect(ticketDesignSnapshot({
      ...DEFAULT_TICKET_DESIGN,
      backgroundColor: "#FF0000",
      accentColor: "#00FF00",
      revision: 0,
      publishedAt: "2027-01-01T00:00:00.000Z",
    }, "event-1")).toMatchObject({
      backgroundColor: "#FF0000",
      accentColor: "#00FF00",
      revision: 0,
    });
  });
});

describe("de twee versies van het ontwerp", () => {
  it("gebruikt de kleuren van de site als standaard", () => {
    expect(DEFAULT_TICKET_DESIGN).toMatchObject({ backgroundColor: "#EFF2F8", accentColor: "#FFD23F", posterRatio: "16:9", showDatePin: true, printPattern: true });
  });

  it("leest een momentopname van voor de nieuwe opties met hun standaard", () => {
    const old = ticketDesignSnapshot({
      template: "POSTER_ARTWORK",
      backgroundColor: "#F8F8F5",
      accentColor: "#F2B632",
      textColor: "#0A0F1F",
      revision: 4,
      publishedAt: "2026-01-01T00:00:00.000Z",
    }, "event-1");
    expect(old).toMatchObject({ revision: 4, showPrice: true, showOrderNumber: true, showLocation: true, posterRatio: "16:9" });
  });

  it("vervangt de oude standaardkleuren, maar geen bewust gekozen kleur", () => {
    expect(withCurrentDefaultColours({ backgroundColor: "#F8F8F5", accentColor: "#f2b632" })).toEqual({ backgroundColor: "#EFF2F8", accentColor: "#FFD23F" });
    expect(withCurrentDefaultColours({ backgroundColor: "#112233", accentColor: "#AABBCC" })).toEqual({ backgroundColor: "#112233", accentColor: "#AABBCC" });
  });
});

describe("A4 ticket PDF", () => {
  const cases = [
    { variant: "colour" as const, posterRatio: "16:9" as const },
    { variant: "colour" as const, posterRatio: "3:2" as const },
    { variant: "colour" as const, posterRatio: "3:1" as const },
    { variant: "print" as const, posterRatio: "16:9" as const },
  ];
  it.each(cases)("tekent de $variant-versie ($posterRatio) op A4", async ({ variant, posterRatio }) => {
    const bytes = await generateTicketsPdf({
      orderNumber: "VTK-DESIGN-TEST",
      currency: "EUR",
      variant,
      event: { id: "event-1", title: "Een ontwerptest met een titel die over twee regels moet lopen", startsAt: new Date("2027-04-03T18:00:00Z"), location: "Leuven" },
      tickets: [{
        publicId: `ticket-${variant}`,
        qrVersion: 1,
        // Een teken buiten WinAnsi liet pdf-lib vroeger gooien: geen ticket.
        attendeeName: "Łukasz Żółć 🎉",
        typeName: "Standaard",
        unitPriceCents: 1_500,
        designSnapshot: {
          ...DEFAULT_TICKET_DESIGN,
          posterRatio,
          noteNl: "Deuren open om 19:30.",
          footerNl: "Met dank aan onze partners.",
          revision: 2,
          publishedAt: "2027-01-01T00:00:00.000Z",
        },
      }],
    });
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(A4_PORTRAIT_POINTS.width, 2);
    expect(height).toBeCloseTo(A4_PORTRAIT_POINTS.height, 2);
    expect(pdf.getSubject()).toBe("A4 admission ticket");
    expect(pdf.getTitle()).toContain(variant === "print" ? "(print)" : "VTK-DESIGN-TEST");
  }, 20_000);
});
