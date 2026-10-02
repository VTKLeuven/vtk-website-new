import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  A4,
  INK,
  LINE,
  MARGIN,
  MUTED,
  toWinAnsi,
  wrap,
  type PdfFont,
} from "@/lib/forms/pdf";

/**
 * De groepjes als afdrukbare lijst: één pagina per groep, met per persoon een
 * rij die je op papier kan afvinken (naam, r-nummer, gsm, kern of niet).
 *
 * Naast de CSV en niet in de plaats ervan: met de CSV maak je de
 * WhatsApp-groepen, met deze lijst sta je aan de deur.
 */

/** Zachte vulling voor de kop van de tabel; geen kleur, dit wordt afgedrukt. */
const HEADER_FILL = rgb(0.94, 0.95, 0.97);

/**
 * Welke vraag een kolom op de afdruk verdient. Niet alle vragen: een lijst
 * waarmee je aan de deur staat, heeft de naam en de contactgegevens nodig, geen
 * zes keuzevragen. Dat zijn de herkenningsvelden (r-nummer) en alles wat een
 * telefoonnummer of een e-mailadres is; de rest staat in de CSV en, samengevat
 * per groep, in de kop van de pagina.
 */
export function isListColumn(field: { type: string; role: string | null }): boolean {
  if (field.role === "IDENTIFIER") return true;
  return field.type === "PHONE" || field.type === "EMAIL";
}

export type GroupPdfColumn = {
  label: string;
  /** Aandeel in de breedte die overblijft naast de naam. */
  weight: number;
};

export type GroupPdfRow = {
  name: string;
  isAnchor: boolean;
  /** Aantal personen op deze inzending; 1 laat de kolom leeg. */
  size: number;
  /** De anderen uit een groepsinschrijving, onder de naam. */
  companions: string[];
  /** Eén waarde per kolom uit `columns`. */
  cells: string[];
};

export type GroupPdfGroup = {
  number: number;
  memberPeople: number;
  anchorPeople: number;
  /** Wat deze groep kenmerkt, zoals op het scherm: "Richting: burgies (12/15)". */
  profile: string[];
  rows: GroupPdfRow[];
};

const TITLE_SIZE = 16;
const ROW_SIZE = 10;
const ROW_HEIGHT = 20;

export async function generateGroupsPdf(input: {
  formTitle: string;
  columns: readonly GroupPdfColumn[];
  groups: readonly GroupPdfGroup[];
  /** Toon de kolom "kern"; leeg wanneer de form geen kernvraag heeft. */
  anchorLabel: string | null;
  locale: "nl" | "en";
  generatedAt?: Date;
}): Promise<Uint8Array> {
  const nl = input.locale === "nl";
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const width = A4.width - MARGIN * 2;

  const stamp = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-BE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(input.generatedAt ?? new Date());

  // De naam krijgt de helft, de rest verdeelt zich over de andere kolommen. Een
  // afvinkvakje vooraan, want deze lijst wordt met een balpen gebruikt.
  const checkWidth = 18;
  const anchorWidth = input.anchorLabel ? 42 : 0;
  const rest = width - checkWidth - anchorWidth;
  const nameWidth = input.columns.length === 0 ? rest : rest * 0.42;
  const totalWeight = input.columns.reduce((sum, column) => sum + column.weight, 0) || 1;
  const columnWidths = input.columns.map(
    (column) => ((rest - nameWidth) * column.weight) / totalWeight
  );

  function cellText(text: string, font: PdfFont, size: number, maxWidth: number): string {
    const clean = toWinAnsi(text);
    if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
    let chunk = "";
    for (const character of clean) {
      if (font.widthOfTextAtSize(`${chunk + character}...`, size) > maxWidth) break;
      chunk += character;
    }
    return `${chunk.trimEnd()}...`;
  }

  for (const group of input.groups) {
    // Altijd een nieuwe pagina per groep: die lijst gaat naar één begeleider.
    let page = document.addPage([A4.width, A4.height]);
    let y = A4.height - MARGIN;
    let continued = false;

    const drawHead = () => {
      page.drawText(
        toWinAnsi(
          `${nl ? "Groep" : "Group"} ${group.number}${
            continued ? (nl ? " (vervolg)" : " (continued)") : ""
          }`
        ),
        { x: MARGIN, y: y - TITLE_SIZE, size: TITLE_SIZE, font: bold, color: INK }
      );
      y -= TITLE_SIZE + 6;

      // Eén regel met waar deze lijst vandaan komt: de form, hoe groot de groep
      // is en wanneer ze gemaakt werd. Wie ze op papier terugvindt, weet dan of
      // ze nog de laatste is.
      const counts = `${group.memberPeople} ${nl ? "personen" : "people"}${
        group.anchorPeople > 0 ? ` + ${group.anchorPeople} ${input.anchorLabel ?? ""}`.trimEnd() : ""
      }`;
      // Altijd eerst door `toWinAnsi`: de standaardletters van PDF kennen geen
      // emoji, en `wrap` meet de tekst al op met die letter.
      for (const line of wrap(
        toWinAnsi(`${input.formTitle}  ·  ${counts}  ·  ${stamp}`),
        regular,
        9,
        width
      )) {
        page.drawText(line, { x: MARGIN, y: y - 9, size: 9, font: regular, color: MUTED });
        y -= 12;
      }
      y -= 6;

      if (!continued && group.profile.length > 0) {
        for (const line of group.profile) {
          for (const wrapped of wrap(toWinAnsi(line), regular, 9, width)) {
            page.drawText(wrapped, { x: MARGIN, y: y - 9, size: 9, font: regular, color: MUTED });
            y -= 12;
          }
        }
        y -= 6;
      }
    };

    const drawColumnHeads = () => {
      page.drawRectangle({
        x: MARGIN,
        y: y - ROW_HEIGHT,
        width,
        height: ROW_HEIGHT,
        color: HEADER_FILL,
      });
      let x = MARGIN + checkWidth;
      const head = (label: string, columnWidth: number) => {
        page.drawText(cellText(label, bold, 9, columnWidth - 8), {
          x: x + 2,
          y: y - ROW_HEIGHT + 7,
          size: 9,
          font: bold,
          color: INK,
        });
        x += columnWidth;
      };
      head(nl ? "Naam" : "Name", nameWidth);
      if (input.anchorLabel) head(input.anchorLabel, anchorWidth);
      input.columns.forEach((column, index) => head(column.label, columnWidths[index]));
      y -= ROW_HEIGHT;
    };

    drawHead();
    drawColumnHeads();

    for (const row of group.rows) {
      const extra = row.companions.length > 0 ? 11 : 0;
      const height = ROW_HEIGHT + extra;
      if (y - height < MARGIN) {
        page = document.addPage([A4.width, A4.height]);
        y = A4.height - MARGIN;
        continued = true;
        drawHead();
        drawColumnHeads();
      }

      // Het vakje om af te vinken.
      page.drawRectangle({
        x: MARGIN + 3,
        y: y - 15,
        width: 10,
        height: 10,
        borderColor: MUTED,
        borderWidth: 0.75,
      });

      let x = MARGIN + checkWidth;
      const cell = (text: string, columnWidth: number, font: PdfFont = regular) => {
        page.drawText(cellText(text, font, ROW_SIZE, columnWidth - 8), {
          x: x + 2,
          y: y - 14,
          size: ROW_SIZE,
          font,
          color: INK,
        });
        x += columnWidth;
      };

      cell(row.name, nameWidth, row.isAnchor ? bold : regular);
      if (input.anchorLabel) cell(row.isAnchor ? (nl ? "ja" : "yes") : "", anchorWidth);
      input.columns.forEach((column, index) => cell(row.cells[index] ?? "", columnWidths[index]));

      if (row.companions.length > 0) {
        // Over de volle breedte en niet binnen de naamkolom: wie deze lijst
        // afdrukt, moet kunnen zien wie er met wie meekwam, en vier namen passen
        // niet in een kolom van 150 punten.
        const label = nl ? "met" : "with";
        page.drawText(
          cellText(`${label} ${row.companions.join(", ")}`, regular, 8, width - checkWidth - 8),
          { x: MARGIN + checkWidth + 2, y: y - 24, size: 8, font: regular, color: MUTED }
        );
      }

      y -= height;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: A4.width - MARGIN, y },
        thickness: 0.5,
        color: LINE,
      });
    }
  }

  // Een PDF zonder pagina's laat zich niet opslaan, en een lege groepjesmaker
  // hoort een lege lijst te geven in plaats van een fout.
  if (input.groups.length === 0) {
    const page = document.addPage([A4.width, A4.height]);
    page.drawText(toWinAnsi(input.formTitle), {
      x: MARGIN,
      y: A4.height - MARGIN - TITLE_SIZE,
      size: TITLE_SIZE,
      font: bold,
      color: INK,
    });
    page.drawText(
      toWinAnsi(nl ? "Er zijn nog geen groepjes." : "There are no groups yet."),
      { x: MARGIN, y: A4.height - MARGIN - TITLE_SIZE - 22, size: 11, font: regular, color: MUTED }
    );
  }

  return document.save();
}
