import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKET_DESIGN,
  parseTicketDesignDraft,
  publishedTicketDesign,
  ticketDesignSnapshot,
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

describe("A4 ticket PDF", () => {
  it.each(["CLASSIC", "POSTER_ARTWORK", "SPLIT_ARTWORK"] as const)("renders the %s template at A4 portrait size", async (template) => {
    const bytes = await generateTicketsPdf({
      orderNumber: "VTK-DESIGN-TEST",
      currency: "EUR",
      event: { id: "event-1", title: "Ontwerptest", startsAt: new Date("2027-04-03T18:00:00Z"), location: "Leuven" },
      tickets: [{
        publicId: `ticket-${template}`,
        qrVersion: 1,
        attendeeName: "Alex Voorbeeld",
        typeName: "Standaard",
        unitPriceCents: 1_500,
        designSnapshot: {
          ...DEFAULT_TICKET_DESIGN,
          template,
          backgroundColor: "#EEDDCC",
          accentColor: "#123456",
          textColor: "#102030",
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
  });
});
