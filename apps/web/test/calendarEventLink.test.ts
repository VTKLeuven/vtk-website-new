import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_LINK_LABEL, eventLinkLabel } from "@/lib/calendar/eventLink";

/**
 * Wat er op de knop naar de externe link van een evenement staat. Leeg = de
 * algemene tekst; een redacteur zet er "Inschrijflink" of "Ticketverkoop" wanneer
 * hij weet waar de link heen gaat.
 */
describe("eventLinkLabel", () => {
  it("valt terug op de standaardtekst wanneer er niets ingevuld is", () => {
    expect(eventLinkLabel({}, "nl")).toBe(DEFAULT_EVENT_LINK_LABEL.nl);
    expect(eventLinkLabel({ urlLabelNl: null, urlLabelEn: null }, "en")).toBe(
      DEFAULT_EVENT_LINK_LABEL.en,
    );
  });

  it("toont de eigen tekst per taal", () => {
    const event = { urlLabelNl: "Inschrijflink", urlLabelEn: "Sign-up link" };
    expect(eventLinkLabel(event, "nl")).toBe("Inschrijflink");
    expect(eventLinkLabel(event, "en")).toBe("Sign-up link");
  });

  it("laat het Engels terugvallen op het Nederlands, niet op de standaardtekst", () => {
    expect(eventLinkLabel({ urlLabelNl: "Ticketverkoop" }, "en")).toBe("Ticketverkoop");
    expect(eventLinkLabel({ urlLabelNl: "Ticketverkoop", urlLabelEn: "" }, "en")).toBe(
      "Ticketverkoop",
    );
  });

  it("behandelt enkel spaties als niet ingevuld", () => {
    expect(eventLinkLabel({ urlLabelNl: "   " }, "nl")).toBe(DEFAULT_EVENT_LINK_LABEL.nl);
  });

  it("laat spaties rond een echte tekst weg", () => {
    expect(eventLinkLabel({ urlLabelNl: "  Meer info  " }, "nl")).toBe("Meer info");
  });

  it("gebruikt het Nederlands niet op de Nederlandse pagina wanneer enkel het Engels ingevuld is", () => {
    expect(eventLinkLabel({ urlLabelEn: "Sign-up link" }, "nl")).toBe(DEFAULT_EVENT_LINK_LABEL.nl);
  });
});
