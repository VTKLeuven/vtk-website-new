import { describe, expect, it } from "vitest";
import { mollieDescription } from "@vtk/payments";

describe("mollieDescription", () => {
  it("opens with the accounting code and leaves the order number to the metadata", () => {
    // Een Mollie-uitbetaling bundelt betalingen van veel verkopen; met de code
    // op een vaste plek vooraan splitst de penning ze zonder iets op te zoeken.
    expect(
      mollieDescription({
        eventName: "12 Urencantus",
        orderNumber: "VTK-26-687BFA5B7C",
        accountingCode: "70010010001",
      }),
    ).toBe("70010010001 12 Urencantus");
  });

  it("keeps the order number when there is no code, because then it is the only trace", () => {
    // De uitleendienst en events van voor de boekhoudcodes.
    expect(
      mollieDescription({ eventName: "VTK uitleendienst", orderNumber: "AB12CD34", accountingCode: null }),
    ).toBe("VTK uitleendienst - AB12CD34");
  });

  it("stays within Mollie's limit", () => {
    expect(
      mollieDescription({ eventName: "E".repeat(400), orderNumber: "X", accountingCode: "730000" }),
    ).toHaveLength(255);
  });
});
