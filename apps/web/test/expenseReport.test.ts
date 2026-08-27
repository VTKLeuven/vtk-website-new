import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

/**
 * Het blad voor de boekhouder moet blijven bouwen.
 *
 * Deze test staat er vooral voor twee dingen die stil kunnen breken: het
 * sjabloon `public/rekeningen/blad.pdf` dat bij een verhuizing van bestanden
 * zoek raakt, en de keuze tussen `embedJpg`/`embedPng`/pagina's overnemen die op
 * het opgeslagen mime-type hangt en niet op de naam die het lid uploadde.
 */

const mocks = vi.hoisted(() => ({ getObjectBuffer: vi.fn() }));
vi.mock("@vtk/storage", () => ({ getObjectBuffer: mocks.getObjectBuffer }));

const { buildExpenseReportPdf } = await import("@/lib/rekeningen/report");

const baseExpense = {
  postLabel: "Fakbar",
  activity: "Doopcantus",
  description: "Bierbestelling",
  payerName: "Lore Vermeulen",
  spentOn: new Date(Date.UTC(2026, 8, 18)),
  amountCents: 24890,
  iban: "BE68539007547034",
  receiptKey: "bonnetjes/abc123.jpg",
};

async function jpegBytes(): Promise<Buffer> {
  return sharp({
    create: { width: 400, height: 700, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .jpeg()
    .toBuffer();
}

describe("blad voor de boekhouder", () => {
  it("bouwt een PDF van één bladzijde met de foto van het bonnetje erin", async () => {
    mocks.getObjectBuffer.mockResolvedValue(await jpegBytes());

    const { bytes, filename } = await buildExpenseReportPdf({
      ...baseExpense,
      paymentMethod: "PERSONAL",
      receiptMime: "image/jpeg",
    });

    expect(filename).toBe("26-27_Fakbar_Doopcantus_Bierbestelling_248.9.pdf");
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("hangt de bladzijden van een PDF-bonnetje achter het blad", async () => {
    const receipt = await PDFDocument.create();
    receipt.addPage();
    receipt.addPage();
    mocks.getObjectBuffer.mockResolvedValue(Buffer.from(await receipt.save()));

    const { bytes } = await buildExpenseReportPdf({
      ...baseExpense,
      receiptKey: "bonnetjes/abc123.pdf",
      paymentMethod: "VTK_CARD",
      iban: null,
      receiptMime: "application/pdf",
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it("draait het bonnetje zonder het blad zelf te kantelen", async () => {
    mocks.getObjectBuffer.mockResolvedValue(await jpegBytes());

    const { bytes } = await buildExpenseReportPdf(
      { ...baseExpense, paymentMethod: "PERSONAL", receiptMime: "image/jpeg" },
      90,
    );

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getRotation().angle).toBe(0);
  });

  it("laat een teken dat WinAnsi niet kent gewoon weg in plaats van te falen", async () => {
    mocks.getObjectBuffer.mockResolvedValue(await jpegBytes());

    await expect(
      buildExpenseReportPdf({
        ...baseExpense,
        description: "Bierbestelling 🍺",
        paymentMethod: "VTK_CARD",
        iban: null,
        receiptMime: "image/jpeg",
      }),
    ).resolves.toBeTruthy();
  });
});
