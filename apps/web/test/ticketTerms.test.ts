import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKET_TERMS,
  parseTicketTerms,
  ticketTermsPath,
} from "@/lib/ticketing/terms";

describe("ticket terms", () => {
  it("uses the existing VTK sales terms as the initial content", () => {
    expect(DEFAULT_TICKET_TERMS.version).toBe("2025-11-23");
    expect(DEFAULT_TICKET_TERMS.bodyNl).toContain("## 3. Lidmaatschap en Tarieven");
    expect(DEFAULT_TICKET_TERMS.bodyEn).toContain("## 3. Membership and Rates");
  });

  it("fills missing or invalid settings with the defaults", () => {
    expect(parseTicketTerms(null)).toEqual(DEFAULT_TICKET_TERMS);
    expect(parseTicketTerms({ version: "2", bodyNl: "Nieuw", bodyEn: "" })).toEqual({
      version: "2",
      bodyNl: "Nieuw",
      bodyEn: DEFAULT_TICKET_TERMS.bodyEn,
    });
  });

  it("returns the fixed localized public route", () => {
    expect(ticketTermsPath("nl")).toBe("/tickets/voorwaarden");
    expect(ticketTermsPath("en")).toBe("/en/tickets/voorwaarden");
  });
});
