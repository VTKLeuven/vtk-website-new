import { describe, expect, it } from "vitest";
import { summarizeGrocomeets, type SummaryMeeting, type SummaryReservation } from "@/lib/grocomeetSummary";

const NOW = new Date("2026-11-17T12:00:00Z");

function reservation(overrides: Partial<SummaryReservation> = {}): SummaryReservation {
  return {
    status: "ACTIVE",
    itemName: "Martino",
    itemPriceCents: 300,
    drinkName: "Cola",
    drinkPriceCents: 100,
    ...overrides,
  };
}

function meeting(overrides: Partial<SummaryMeeting> & { startsAt: Date }): SummaryMeeting {
  return { id: overrides.startsAt.toISOString(), semester: 1, reservations: [], boxOrders: [], ...overrides };
}

describe("summarizeGrocomeets", () => {
  it("telt broodjes, drankjes en bedragen per vergadering en voor het jaar", () => {
    const summary = summarizeGrocomeets(
      [
        meeting({
          startsAt: new Date("2026-10-02T10:45:00Z"),
          reservations: [reservation(), reservation({ itemName: "Kip curry", itemPriceCents: 350 })],
        }),
        meeting({
          startsAt: new Date("2026-10-09T10:45:00Z"),
          reservations: [reservation({ drinkName: null, drinkPriceCents: 0 })],
        }),
      ],
      NOW,
    );

    expect(summary.meetings.map((row) => [row.formItems, row.formDrinks, row.formCents])).toEqual([
      [2, 2, 850],
      [1, 0, 300],
    ]);
    expect(summary.year).toMatchObject({ meetings: 2, formItems: 3, formDrinks: 2, totalCents: 1150 });
    expect(summary.products).toEqual([
      { source: "FORM_ITEM", name: "Martino", count: 2, cents: 600 },
      { source: "FORM_ITEM", name: "Kip curry", count: 1, cents: 350 },
      { source: "FORM_DRINK", name: "Cola", count: 2, cents: 200 },
    ]);
  });

  it("laat vergaderingen die nog moeten komen weg en telt ze apart", () => {
    const summary = summarizeGrocomeets(
      [
        meeting({ startsAt: new Date("2026-11-13T11:45:00Z"), reservations: [reservation()] }),
        meeting({ startsAt: new Date("2026-11-20T11:45:00Z"), reservations: [reservation()] }),
      ],
      NOW,
    );
    expect(summary.meetings).toHaveLength(1);
    expect(summary.upcoming).toBe(1);
    expect(summary.year.totalCents).toBe(400);
  });

  it("telt een ongeldige inschrijving niet, en een inschrijving zonder bestelling enkel als aanwezige", () => {
    const summary = summarizeGrocomeets(
      [
        meeting({
          startsAt: new Date("2026-10-02T10:45:00Z"),
          reservations: [
            reservation({ status: "INVALIDATED" }),
            reservation({ itemName: null, itemPriceCents: 0, drinkName: null, drinkPriceCents: 0 }),
          ],
        }),
      ],
      NOW,
    );
    expect(summary.meetings[0]).toMatchObject({ attendees: 1, formItems: 0, formDrinks: 0, totalCents: 0 });
    expect(summary.products).toEqual([]);
  });

  it("houdt de GM-doos apart en telt enkel open of afgegeven bestellingen", () => {
    const summary = summarizeGrocomeets(
      [
        meeting({
          startsAt: new Date("2026-10-02T10:45:00Z"),
          reservations: [reservation()],
          boxOrders: [
            { status: "PICKED_UP", lines: [{ name: "Broodje van de week", quantity: 2, unitPriceCents: 400 }] },
            { status: "RESERVED", lines: [{ name: "broodje van de week ", quantity: 1, unitPriceCents: 400 }] },
            { status: "CANCELLED", lines: [{ name: "Broodje van de week", quantity: 1, unitPriceCents: 400 }] },
            { status: "NO_SHOW", lines: [{ name: "Martino", quantity: 1, unitPriceCents: 300 }] },
          ],
        }),
      ],
      NOW,
    );
    expect(summary.meetings[0]).toMatchObject({ formCents: 400, boxItems: 3, boxCents: 1200, totalCents: 1600 });
    expect(summary.products.filter((row) => row.source === "BOX")).toEqual([
      { source: "BOX", name: "Broodje van de week", count: 3, cents: 1200 },
    ]);
  });

  it("telt per product op tot hetzelfde totaal als per vergadering", () => {
    const summary = summarizeGrocomeets(
      [
        meeting({
          startsAt: new Date("2026-10-02T10:45:00Z"),
          reservations: [reservation(), reservation({ itemName: null, itemPriceCents: 0 })],
          boxOrders: [{ status: "PICKED_UP", lines: [{ name: "Martino", quantity: 2, unitPriceCents: 300 }] }],
        }),
      ],
      NOW,
    );
    const productTotal = summary.products.reduce((total, row) => total + row.cents, 0);
    expect(productTotal).toBe(summary.year.totalCents);
    expect(summary.year.totalCents).toBe(summary.year.formCents + summary.year.boxCents);
  });

  it("geeft totalen per semester en een detailregel per vergadering per product", () => {
    const summary = summarizeGrocomeets(
      [
        meeting({ startsAt: new Date("2026-10-02T10:45:00Z"), semester: 1, reservations: [reservation()] }),
        meeting({ startsAt: new Date("2026-03-06T11:45:00Z"), semester: 2, reservations: [reservation()] }),
      ],
      NOW,
    );
    expect(summary.semesters.map((row) => [row.semester, row.meetings, row.totalCents])).toEqual([
      [1, 1, 400],
      [2, 1, 400],
    ]);
    // Chronologisch, ook als de invoer dat niet is.
    expect(summary.details.map((row) => [row.semester, row.source, row.count])).toEqual([
      [2, "FORM_ITEM", 1],
      [2, "FORM_DRINK", 1],
      [1, "FORM_ITEM", 1],
      [1, "FORM_DRINK", 1],
    ]);
  });
});

describe("grocomeetSummaryXlsx", () => {
  it("schrijft een werkboek met het totaal vooraan", async () => {
    const { grocomeetSummaryXlsx } = await import("@/lib/grocomeetSummaryXlsx");
    const { readWorkbook, cellKey, cellText } = await import("@/lib/praesidiumShifts/xlsx");
    const summary = summarizeGrocomeets(
      [
        meeting({
          startsAt: new Date("2026-10-02T10:45:00Z"),
          reservations: [reservation()],
          boxOrders: [{ status: "PICKED_UP", lines: [{ name: "Broodje van de week", quantity: 1, unitPriceCents: 400 }] }],
        }),
      ],
      NOW,
    );
    const file = await grocomeetSummaryXlsx(summary, 2026, true);
    const workbook = readWorkbook(file);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["Totaal", "Per vergadering", "Per product", "Detail"]);
    const totals = workbook.sheets[0];
    expect(cellText(totals.cells.get(cellKey(6, 1)))).toBe("Totaal 26-27");
    expect(totals.cells.get(cellKey(6, 3))?.value).toEqual({ kind: "number", value: 8 });
    const products = workbook.sheets[2];
    expect(cellText(products.cells.get(cellKey(2, 2)))).toBe("Martino");
    expect(cellText(products.cells.get(cellKey(4, 1)))).toBe("GM-doos (Theokot)");
  });
});
