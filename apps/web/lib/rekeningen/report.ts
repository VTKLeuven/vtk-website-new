import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { degrees, PDFDocument } from "pdf-lib";
import { getObjectBuffer } from "@vtk/storage";
import { academicYearTag, expenseReportFilename, formatIban, toDateInputValue } from "./expenses";

/**
 * Het blad voor de boekhouder.
 *
 * De boekhouding aanvaardt één vast formulier per uitgave: `blad.pdf`, met de
 * gegevens op vaste plaatsen en het bonnetje eronder geplakt. Dit is een
 * getrouwe overname van `lib/billReport.ts` uit billsheet, coördinaten inbegrepen
 * (de vorige bladen liggen in dezelfde map bij de boekhouder, dus ze moeten er
 * hetzelfde uitzien). Wijzig de posities dus niet zonder dat iemand het nieuwe
 * blad naast een oud legt.
 */

const TEMPLATE_PATH = join(process.cwd(), "public", "rekeningen", "blad.pdf");

/** Waar elk veld op het blad staat, in PDF-punten vanaf linksonder. */
const FIELDS = {
  academicYear: { x: 40, y: 715 },
  post: { x: 150, y: 805 },
  activity: { x: 355, y: 805 },
  description: { x: 195, y: 786 },
  payerName: { x: 150, y: 768 },
  spentOn: { x: 162, y: 750 },
  cardVtkTick: { x: 232, y: 732 },
  personalTick: { x: 336, y: 732 },
  iban: { x: 155, y: 715 },
} as const;

const FONT_SIZE = 13;

export type ExpenseReportInput = {
  postLabel: string;
  activity: string;
  description: string;
  payerName: string;
  spentOn: Date;
  amountCents: number;
  paymentMethod: "VTK_CARD" | "PERSONAL";
  iban: string | null;
  receiptKey: string;
  /**
   * Het type zoals het in de opslag staat, niet de naam die het lid uploadde:
   * de uploadroute hercodeert elke foto naar JPEG, dus een bonnetje dat
   * "kassa.png" heet ligt er als JPEG.
   */
  receiptMime: string;
};

/**
 * `pdf-lib` tekent met WinAnsi en gooit op een teken dat daar niet in zit. Een
 * omschrijving met een emoji of een Chinees teken erin mag geen 500 opleveren:
 * die letter valt gewoon weg.
 */
function winAnsiSafe(value: string): string {
  return value.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

/**
 * Bouwt het ingevulde blad met het bonnetje erin.
 *
 * `rotate` draait het bonnetje in stappen van 90 graden; een foto van een lang
 * kassaticket komt vaak liggend uit de telefoon, en zonder dit staat de helft
 * ondersteboven op het blad.
 */
export async function buildExpenseReportPdf(
  expense: ExpenseReportInput,
  rotate = 0,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const template = readFileSync(TEMPLATE_PATH);
  const doc = await PDFDocument.load(template);
  const page = doc.getPage(0);
  const angle = ((Math.round(rotate / 90) * 90) % 360 + 360) % 360;

  const draw = (text: string, at: { x: number; y: number }) => {
    if (!text) return;
    page.drawText(winAnsiSafe(text), { x: at.x, y: at.y, size: FONT_SIZE });
  };

  draw(academicYearTag(expense.spentOn, "long"), FIELDS.academicYear);
  draw(expense.postLabel, FIELDS.post);
  draw(expense.activity, FIELDS.activity);
  draw(expense.description, FIELDS.description);
  draw(expense.payerName, FIELDS.payerName);
  draw(toDateInputValue(expense.spentOn), FIELDS.spentOn);

  if (expense.paymentMethod === "VTK_CARD") {
    draw("X", FIELDS.cardVtkTick);
  } else {
    draw("X", FIELDS.personalTick);
    draw(formatIban(expense.iban), FIELDS.iban);
  }

  const receipt = await getObjectBuffer(expense.receiptKey);

  if (expense.receiptMime === "application/pdf") {
    // Een bonnetje dat zelf een PDF is (een online bestelbevestiging) krijgt
    // eigen bladzijden achter het blad in plaats van als afbeelding geplakt te
    // worden: dat houdt de tekst leesbaar en selecteerbaar.
    const receiptDoc = await PDFDocument.load(receipt);
    const pages = await doc.copyPages(receiptDoc, receiptDoc.getPageIndices());
    for (const receiptPage of pages) {
      if (angle) receiptPage.setRotation(degrees(angle));
      doc.addPage(receiptPage);
    }
  } else {
    const image =
      expense.receiptMime === "image/png"
        ? await doc.embedPng(receipt)
        : await doc.embedJpg(receipt);

    // Draaien gebeurt rond de linkeronderhoek, dus de tekenpositie moet mee
    // verschuiven om het beeld gecentreerd te houden in de onderste helft.
    const sideways = angle === 90 || angle === 270;
    const { width, height } = image.scaleToFit(sideways ? 570 : 580, sideways ? 580 : 570);
    const centerX = 590 / 2;
    const centerY = 600 / 2;
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    page.drawImage(image, {
      x: centerX - (width / 2) * cos + (height / 2) * sin,
      y: centerY - (width / 2) * sin - (height / 2) * cos,
      width,
      height,
      rotate: degrees(angle),
    });
  }

  return {
    bytes: await doc.save(),
    filename: expenseReportFilename({
      spentOn: expense.spentOn,
      postLabel: expense.postLabel,
      activity: expense.activity,
      description: expense.description,
      amountCents: expense.amountCents,
    }),
  };
}
