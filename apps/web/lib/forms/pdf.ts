import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * De inzendingen als PDF, om af te drukken of door te sturen naar wie geen
 * spreadsheet openmaakt (een jury bij een sollicitatie, bijvoorbeeld).
 *
 * Bewust sober: één inzending per blok met label-en-antwoord onder elkaar. De
 * CSV blijft het formaat om mee te rekenen.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = rgb(0.04, 0.06, 0.12);
const MUTED = rgb(0.36, 0.4, 0.5);
const LINE = rgb(0.85, 0.87, 0.91);

export type PdfEntry = {
  title: string;
  subtitle: string;
  answers: Array<{ label: string; value: string }>;
};

/**
 * De standaardletters van PDF kennen enkel WinAnsi. Eén emoji in een antwoord
 * zou anders de hele export laten mislukken met "WinAnsi cannot encode", dus
 * vervangen we wat niet kan door een vraagteken in plaats van te crashen.
 */
function toWinAnsi(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x09\x0a\x20-\x7e¡-ÿ€]/g, "?");
}

type Font = Awaited<ReturnType<PDFDocument["embedFont"]>>;

/** Breekt een regel af op woordgrens, en desnoods midden in een lang woord. */
function wrap(text: string, font: Font, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(chunk + character, size) > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk += character;
        }
      }
      current = chunk;
    }
    lines.push(current);
  }
  return lines;
}

export async function generateEntriesPdf(input: {
  formTitle: string;
  entries: readonly PdfEntry[];
  generatedAt?: Date;
  locale: "nl" | "en";
}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const width = A4.width - MARGIN * 2;

  let page = document.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const need = (space: number) => {
    if (y - space >= MARGIN) return;
    page = document.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };

  const write = (text: string, font: Font, size: number, colour = INK) => {
    for (const line of wrap(toWinAnsi(text), font, size, width)) {
      need(size + 6);
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color: colour });
      y -= size + 4;
    }
  };

  write(input.formTitle, bold, 18);
  y -= 4;
  write(
    `${input.entries.length} ${input.locale === "nl" ? "inzendingen" : "entries"} · ${new Intl.DateTimeFormat(
      input.locale === "nl" ? "nl-BE" : "en-BE",
      { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }
    ).format(input.generatedAt ?? new Date())}`,
    regular,
    10,
    MUTED
  );
  y -= 12;

  for (const entry of input.entries) {
    // Een inzending niet laten beginnen onderaan een pagina waar enkel de kop
    // nog past.
    need(90);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4.width - MARGIN, y },
      thickness: 0.75,
      color: LINE,
    });
    y -= 16;

    write(entry.title, bold, 12);
    write(entry.subtitle, regular, 9, MUTED);
    y -= 4;

    for (const answer of entry.answers) {
      write(answer.label, bold, 9, MUTED);
      write(answer.value || "-", regular, 11);
      y -= 2;
    }
    y -= 12;
  }

  return document.save();
}
