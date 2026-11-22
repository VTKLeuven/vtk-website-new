import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setCharacterSpacing,
  type RGB,
} from "pdf-lib";
import sharp from "sharp";
import { getObjectBuffer } from "@vtk/storage";
import { createStyledVtkQrPng } from "@/lib/shortlink-qr";
import { createTicketCredential } from "./crypto";
import {
  ticketDesignSnapshot,
  withCurrentDefaultColours,
  type TicketDesignSnapshot,
  type TicketPdfVariant,
  type TicketPosterRatio,
} from "./design";
import { formatMoney } from "./money";

/**
 * De ticket-PDF, in twee versies uit één ontwerp (zie `lib/ticketing/design.ts`
 * en docs/design-decisions.md, "De ticket-PDF in twee versies"):
 *
 * - **kleur**: de evenementtegel van /kalender. De affiche bovenaan (zonder
 *   affiche de banner van het ticketevent, en zonder banner een navy vlak met
 *   het technische patroon), de gele datumpin over
 *   de onderrand, de titel met de gele streep, en de QR in een witte kaart met
 *   de accentrand.
 * - **print**: wit papier, het technische patroon als dunne lijnen in de kop,
 *   en verder enkel lijnen en tekst. Gemaakt voor een zwart-witprinter: het
 *   enige vlak inkt is de QR-code zelf.
 *
 * Coördinaten worden van boven naar beneden gerekend (`top`) en pas bij het
 * tekenen omgezet: dat leest als de lay-out op het scherm, waar ze vandaan komt.
 *
 * Het lettertype is Helvetica, een standaardlettertype van PDF. Inter vraagt
 * `@pdf-lib/fontkit` en een ingebed fontbestand; dat staat nog open.
 */

export const A4_PORTRAIT_POINTS = { width: 595.28, height: 841.89 } as const;

/** De banner van het ticketevent, met het focuspunt in procent zoals de affiche. */
export type TicketPdfBanner = { key: string; focalX: number; focalY: number };

export type TicketPdfInput = {
  orderNumber: string;
  currency: string;
  /** De taal van de bestelling; bepaalt de labels en de datum. Standaard Nederlands. */
  locale?: "nl" | "en";
  /** Standaard de kleurversie. */
  variant?: TicketPdfVariant;
  event: {
    id?: string;
    title: string;
    startsAt: Date;
    location: string | null;
    /** De banner van het ticketevent (`ticketPdfBanner`): die staat bovenaan
     * de kleurversie wanneer het ontwerp geen eigen affiche heeft. */
    banner?: TicketPdfBanner | null;
  };
  /** Each ticket keeps the design which was current when it was issued. */
  tickets: Array<{
    publicId: string;
    qrVersion: number;
    attendeeName: string;
    typeName: string;
    unitPriceCents: number;
    status?: string;
    designSnapshot?: unknown;
  }>;
};

type PdfDoc = PDFDocument;
type PdfPage = ReturnType<PDFDocument["addPage"]>;
type PdfFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;
type PdfImage = Awaited<ReturnType<PDFDocument["embedPng"]>>;

// De tokens van vtk-base.css, als PDF-kleur.
const INK = hex("#0A0F1F");
const NAVY = hex("#0E1A36");
const BODY = hex("#34405E");
const MUTED = hex("#5C667F");
const ON_DARK_MUTED = hex("#B7C0DC");
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.86, 0.88, 0.92);

function hex(value: string): RGB {
  const parsed = Number.parseInt(value.slice(1), 16);
  return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

function luminance(value: string) {
  const parsed = Number.parseInt(value.slice(1), 16);
  return (0.2126 * ((parsed >> 16) & 255) + 0.7152 * ((parsed >> 8) & 255) + 0.0722 * (parsed & 255)) / 255;
}

/** Tekst op een vlak in de accentkleur: donker op geel, licht op een donkere keuze. */
function textOn(fill: string): RGB {
  return luminance(fill) > 0.55 ? INK : WHITE;
}

/** Een gekozen tekstkleur die op wit onleesbaar zou zijn, valt terug op inkt. */
function readable(value: string): RGB {
  return luminance(value) > 0.7 ? INK : hex(value);
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

type Labels = ReturnType<typeof labelsFor>;

function labelsFor(locale: "nl" | "en") {
  const nl = locale === "nl";
  return {
    intl: nl ? "nl-BE" : "en-GB",
    kicker: nl ? "TOEGANGSTICKET" : "ADMISSION TICKET",
    attendee: nl ? "DEELNEMER" : "ATTENDEE",
    type: nl ? "TICKETTYPE" : "TICKET TYPE",
    price: nl ? "PRIJS" : "PRICE",
    order: nl ? "BESTELLING" : "ORDER",
    ticketId: nl ? "Ticket-ID" : "Ticket ID",
    scan: nl ? "SCAN AAN DE INGANG" : "SCAN AT THE ENTRANCE",
    entrance: nl ? "AAN DE INGANG" : "AT THE ENTRANCE",
    defaultNote: nl
      ? "Toon deze code op je gsm of op papier. Elke code geldt één keer: wie hem eerst laat scannen, komt binnen."
      : "Show this code on your phone or on paper. Each code works once: whoever has it scanned first gets in.",
    yourTickets: nl ? "JE TICKETS" : "YOUR TICKETS",
    yourTicketsText: nl
      ? "Altijd terug te vinden onder Mijn account op vtk.be en in de VTK-app."
      : "Always available under My account on vtk.be and in the VTK app.",
    locationTbc: nl ? "Locatie wordt nog bevestigd" : "Location to be confirmed",
    status: (status: string) =>
      status === "VALID"
        ? nl ? "Geldig" : "Valid"
        : status === "CHECKED_IN"
          ? nl ? "Gescand" : "Checked in"
          : status.replaceAll("_", " ").toLowerCase(),
    revision: (revision: number) =>
      revision === 0 ? (nl ? "Ontwerp: concept" : "Design: draft") : nl ? `Ontwerp v${revision}` : `Design v${revision}`,
    kring: "Vlaamse Technische Kring",
  };
}

// ---------------------------------------------------------------------------
// Tekst
// ---------------------------------------------------------------------------

/**
 * Helvetica kent enkel WinAnsi. Een naam met een teken daarbuiten (ł, ş, een
 * emoji) liet pdf-lib vroeger gooien, en dan kwam er geen enkel ticket. Wat
 * niet bestaat, verliest eerst zijn accent en wordt anders weggelaten.
 */
/** Letters zonder losse diakritische vorm, die NFD dus niet kan ontleden. */
const LOOKALIKE: Record<string, string> = {
  "\u0141": "L", // Ł
  "\u0142": "l", // ł
  "\u0110": "D", // Đ
  "\u0111": "d", // đ
  "\u0126": "H", // Ħ
  "\u0127": "h", // ħ
  "\u0131": "i", // ı
};

function safeText(font: PdfFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  // Intl zet een harde of smalle spatie tussen het euroteken en het bedrag.
  for (const char of text.replace(/[\r\n\t\u00A0\u2009\u202F]+/g, " ")) {
    const code = char.codePointAt(0)!;
    if (supported.has(code)) {
      out += char;
      continue;
    }
    const base = LOOKALIKE[char] ?? char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (base && [...base].every((c) => supported.has(c.codePointAt(0)!))) out += base;
  }
  return out;
}

function fitSize(font: PdfFont, text: string, maxWidth: number, preferred: number, min: number): number {
  let size = preferred;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function truncate(font: PdfFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut.trimEnd()}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Breekt een tekst op woorden in hoogstens `maxLines` regels; de laatste krijgt een beletselteken. */
function wrap(font: PdfFont, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length > 0) {
    lines[lines.length - 1] = truncate(font, `${lines[lines.length - 1]} ${words.slice(consumed).join(" ")}`, size, maxWidth);
  }
  return lines.map((line) => truncate(font, line, size, maxWidth));
}

type Painter = {
  page: PdfPage;
  H: number;
  fonts: { regular: PdfFont; bold: PdfFont };
};

/** Tekst op een basislijn `top` (van boven gerekend). */
function text(p: Painter, value: string, x: number, top: number, size: number, opts: { bold?: boolean; color?: RGB; spacing?: number; opacity?: number } = {}) {
  const font = opts.bold ? p.fonts.bold : p.fonts.regular;
  if (opts.spacing) p.page.pushOperators(setCharacterSpacing(opts.spacing));
  p.page.drawText(value, { x, y: p.H - top, size, font, color: opts.color ?? INK, opacity: opts.opacity });
  if (opts.spacing) p.page.pushOperators(setCharacterSpacing(0));
}

function textWidth(p: Painter, value: string, size: number, bold = false, spacing = 0) {
  return (bold ? p.fonts.bold : p.fonts.regular).widthOfTextAtSize(value, size) + spacing * value.length;
}

/** Een klein kapitaallabel boven een waarde, zoals de `dt` op de site. */
function label(p: Painter, value: string, x: number, top: number, color: RGB = MUTED) {
  text(p, value, x, top, 7, { bold: true, color, spacing: 0.8 });
}

// ---------------------------------------------------------------------------
// Vormen
// ---------------------------------------------------------------------------

function rect(p: Painter, x: number, top: number, width: number, height: number, opts: { color?: RGB; borderColor?: RGB; borderWidth?: number; opacity?: number }) {
  p.page.drawRectangle({ x, y: p.H - top - height, width, height, ...opts });
}

function roundedPath(width: number, height: number, r: number): string {
  return `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

function rounded(p: Painter, x: number, top: number, width: number, height: number, r: number, opts: { color?: RGB; borderColor?: RGB; borderWidth?: number }) {
  p.page.drawSvgPath(roundedPath(width, height, r), { x, y: p.H - top, ...opts });
}

/**
 * Snijdt de hoeken van een rechthoekig beeld rond af door ze over te schilderen
 * in de kleur eronder. Een echte afgeronde clip vraagt een pad met bogen in de
 * clipoperator, wat pdf-lib niet aanbiedt; dit geeft op papier hetzelfde.
 */
function roundTopCorners(p: Painter, x: number, top: number, width: number, r: number, ground: RGB) {
  p.page.drawSvgPath(`M 0 0 H ${r} A ${r} ${r} 0 0 0 0 ${r} Z`, { x, y: p.H - top, color: ground });
  p.page.drawSvgPath(`M ${-r} 0 H 0 V ${r} A ${r} ${r} 0 0 0 ${-r} 0 Z`, { x: x + width, y: p.H - top, color: ground });
}

function withClip(p: Painter, x: number, top: number, width: number, height: number, draw: () => void) {
  p.page.pushOperators(pushGraphicsState(), rectangle(x, p.H - top - height, width, height), clip(), endPath());
  draw();
  p.page.pushOperators(popGraphicsState());
}

function drawCover(p: Painter, image: PdfImage, x: number, top: number, width: number, height: number, focalX: number, focalY: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  const drawX = x - Math.max(0, drawnWidth - width) * (focalX / 100);
  const drawTop = top - Math.max(0, drawnHeight - height) * (focalY / 100);
  withClip(p, x, top, width, height, () => {
    p.page.drawImage(image, { x: drawX, y: p.H - drawTop - drawnHeight, width: drawnWidth, height: drawnHeight });
  });
}

/** Past een beeld in een kader zonder te vergroten; `align` kiest de kant. */
function drawContain(p: Painter, image: PdfImage, x: number, top: number, width: number, height: number, align: "left" | "right" | "center" = "center") {
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const dx = align === "left" ? 0 : align === "right" ? width - w : (width - w) / 2;
  p.page.drawImage(image, { x: x + dx, y: p.H - top - (height - h) / 2 - h, width: w, height: h });
}

/** Het technische patroon, getegeld en afgeknipt op het vak, zoals de navy banden van de site. */
function drawPattern(p: Painter, tile: PdfImage, x: number, top: number, width: number, height: number, opacity: number, offset: { x: number; y: number }) {
  const size = 300;
  withClip(p, x, top, width, height, () => {
    for (let tx = x - offset.x; tx < x + width; tx += size) {
      for (let ty = top - offset.y; ty < top + height; ty += size) {
        p.page.drawImage(tile, { x: tx, y: p.H - ty - size, width: size, height: size, opacity });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Bestanden
// ---------------------------------------------------------------------------

async function loadAsset(document: PdfDoc, key: string | undefined) {
  if (!key) return null;
  try {
    const bytes = await getObjectBuffer(key);
    // Uploads normalise artwork to JPEG and logos to PNG. Keep the fallback for
    // a manually restored asset from before that endpoint existed.
    try {
      return await document.embedPng(bytes);
    } catch {
      return await document.embedJpg(bytes);
    }
  } catch (error) {
    console.warn("Ticket design asset unavailable", { key, error });
    return null;
  }
}

/**
 * De banner van het ticketevent komt van de gewone uploader, en die bewaart ook
 * WebP of SVG; pdf-lib kent enkel PNG en JPEG. Daarom gaat ze eerst langs sharp,
 * en meteen begrensd, zodat een foto van 20 MB de mailbijlage niet opblaast.
 */
async function loadBanner(document: PdfDoc, key: string | undefined) {
  if (!key) return null;
  try {
    const jpeg = await sharp(await getObjectBuffer(key))
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return await document.embedJpg(jpeg);
  } catch (error) {
    console.warn("Ticket banner unavailable", { key, error });
    return null;
  }
}

/** Een bestand uit `public/`, één keer per document ingebed. Ontbreekt het, dan tekent de PDF verder zonder. */
async function loadPublic(document: PdfDoc, path: string): Promise<PdfImage | null> {
  try {
    return await document.embedPng(readFileSync(join(process.cwd(), "public", path)));
  } catch (error) {
    console.warn("Ticket PDF asset unavailable", { path, error });
    return null;
  }
}

type Brand = {
  logoLight: PdfImage | null;
  logoInk: PdfImage | null;
  patternWhite: PdfImage | null;
  patternInk: PdfImage | null;
};

// ---------------------------------------------------------------------------
// Inhoud
// ---------------------------------------------------------------------------

type Content = {
  eventTitle: string;
  date: string;
  day: string;
  month: string;
  location: string | null;
  typeName: string;
  attendeeName: string;
  price: string | null;
  orderNumber: string | null;
  ticketId: string;
  status: string;
  qr: PdfImage;
  note: string;
  footer: string;
  revision: string;
};

/** `artwork` is de affiche van het ontwerp of, zonder affiche, de banner van het event; `focal` hoort erbij. */
type Assets = { artwork: PdfImage | null; focal: { x: number; y: number }; eventLogo: PdfImage | null; sponsorLogo: PdfImage | null };

const RATIO: Record<TicketPosterRatio, number> = { "16:9": 16 / 9, "3:2": 3 / 2, "2:1": 2, "3:1": 3 };

const M = 42;

/** Het VTK-logo links, en rechts het eventlogo of het woord "toegangsticket". */
function drawTopRow(p: Painter, labels: Labels, logo: PdfImage | null, eventLogo: PdfImage | null, top: number, width: number, kickerColor: RGB) {
  const logoHeight = 20;
  if (logo) drawContain(p, logo, M, top, (logo.width / logo.height) * logoHeight, logoHeight, "left");
  if (eventLogo) {
    drawContain(p, eventLogo, width - M - 120, top - 3, 120, 26, "right");
  } else {
    const kickerWidth = textWidth(p, labels.kicker, 7.5, true, 1.1);
    text(p, labels.kicker, width - M - kickerWidth, top + 13, 7.5, { bold: true, color: kickerColor, spacing: 1.1 });
  }
}

/** Een titel van één regel als het kan, anders twee, nooit over de gegeven breedte. */
function titleLines(p: Painter, title: string, maxWidth: number, preferred: number, min: number) {
  const single = fitSize(p.fonts.bold, title, maxWidth, preferred, min);
  if (p.fonts.bold.widthOfTextAtSize(title, single) <= maxWidth) return { size: single, lines: [title] };
  const size = Math.max(min, preferred - 6);
  return { size, lines: wrap(p.fonts.bold, title, size, maxWidth, 2) };
}

/** De voettekst, het sponsorlogo en de onderste regel. Geeft terug waar die zone begint. */
function drawFooter(p: Painter, width: number, content: Content, sponsorLogo: PdfImage | null, bottomLeft: string, rule: RGB) {
  const ruleTop = p.H - 46;
  rect(p, M, ruleTop, width - M * 2, 0.6, { color: rule });
  text(p, truncate(p.fonts.regular, bottomLeft, 8, width - M * 2 - 60), M, ruleTop + 14, 8, { color: BODY });
  const site = "vtk.be";
  text(p, site, width - M - textWidth(p, site, 8), ruleTop + 14, 8, { color: BODY });
  text(p, content.revision, M, ruleTop + 30, 6, { color: MUTED });

  let zoneTop = ruleTop;
  const footerLines = content.footer ? wrap(p.fonts.regular, content.footer, 8, width - M * 2 - (sponsorLogo ? 140 : 0), 3) : [];
  const zoneHeight = Math.max(sponsorLogo ? 34 : 0, footerLines.length * 10.5);
  if (zoneHeight > 0) {
    zoneTop = ruleTop - 14 - zoneHeight;
    footerLines.forEach((line, index) => text(p, line, M, zoneTop + 8 + index * 10.5, 8, { color: BODY }));
    if (sponsorLogo) drawContain(p, sponsorLogo, width - M - 120, zoneTop, 120, 34, "right");
  }
  return zoneTop;
}

/** De QR met de gegevens ernaast. Gedeeld door beide versies; enkel de stijl verschilt. */
function drawDetails(
  p: Painter,
  labels: Labels,
  content: Content,
  x: number,
  top: number,
  width: number,
  qrSize: number,
  style: { valueColor: RGB; rule: RGB; statusFill: RGB | null; order: "attendee-first" | "type-first" }
) {
  p.page.drawImage(content.qr, { x, y: p.H - top - qrSize, width: qrSize, height: qrSize });

  const dx = x + qrSize + 24;
  const dw = Math.max(80, width - qrSize - 24);
  const blocks: Array<{ label: string; value: string; size: number }> = [
    { label: labels.attendee, value: content.attendeeName, size: 17 },
    { label: labels.type, value: content.typeName, size: 13 },
  ];
  if (style.order === "type-first") blocks.reverse();

  // Het blok staat verticaal gecentreerd naast de QR.
  const small = [content.price, content.orderNumber].filter(Boolean).length > 0;
  const blockHeight = blocks.length * 40 + (small ? 44 : 0) + 18;
  let cursor = top + Math.max(0, (qrSize - blockHeight) / 2);

  for (const block of blocks) {
    label(p, block.label, dx, cursor + 7);
    const size = fitSize(p.fonts.bold, block.value, dw, block.size, 9);
    text(p, truncate(p.fonts.bold, block.value, size, dw), dx, cursor + 9 + size, size, { bold: true, color: style.valueColor });
    cursor += 40;
  }

  if (small) {
    rect(p, dx, cursor - 2, dw, 0.6, { color: style.rule });
    const columns = [
      content.price ? { label: labels.price, value: content.price } : null,
      content.orderNumber ? { label: labels.order, value: content.orderNumber } : null,
    ].filter((column): column is { label: string; value: string } => column !== null);
    const columnWidth = dw / columns.length;
    columns.forEach((column, index) => {
      const cx = dx + index * columnWidth;
      label(p, column.label, cx, cursor + 12);
      text(p, truncate(p.fonts.bold, column.value, 10, columnWidth - 8), cx, cursor + 26, 10, { bold: true, color: style.valueColor });
    });
    cursor += 44;
  }

  let sx = dx;
  if (style.statusFill) {
    rect(p, dx, cursor + 1, 7, 7, { color: style.statusFill, borderColor: NAVY, borderWidth: 0.6 });
    sx += 12;
  }
  text(p, content.status, sx, cursor + 8, 8.5, { bold: true, color: style.valueColor });
  const statusWidth = textWidth(p, content.status, 8.5, true);
  text(p, truncate(p.fonts.regular, `·  ${labels.ticketId} ${content.ticketId}`, 8, dw - (sx - dx) - statusWidth - 6), sx + statusWidth + 6, cursor + 8, 8, { color: MUTED });
}

/** De hoogte van de twee infokolommen. */
const INFO_HEIGHT = 74;

/** Twee kolommen met een haarlijn links, zoals de rail van een inhoudspagina. */
function drawInfoColumns(p: Painter, width: number, top: number, labels: Labels, content: Content, line: RGB) {
  const columnWidth = (width - M * 2 - 24) / 2;
  const columns = [
    { heading: labels.entrance, body: content.note },
    { heading: labels.yourTickets, body: labels.yourTicketsText },
  ];
  columns.forEach((column, index) => {
    const x = M + index * (columnWidth + 24);
    rect(p, x, top, 0.75, INFO_HEIGHT - 10, { color: line });
    label(p, column.heading, x + 12, top + 8, INK);
    wrap(p.fonts.regular, column.body, 9.5, columnWidth - 16, 4).forEach((value, lineIndex) => {
      text(p, value, x + 12, top + 24 + lineIndex * 13, 9.5, { color: BODY });
    });
  });
}

// ---------------------------------------------------------------------------
// Kleurversie: de evenementtegel
// ---------------------------------------------------------------------------

function drawColourTicket(p: Painter, design: TicketDesignSnapshot, assets: Assets, brand: Brand, labels: Labels, content: Content) {
  const { width } = p.page.getSize();
  const ground = hex(design.backgroundColor);
  const accent = hex(design.accentColor);
  const ink = readable(design.textColor);
  const darkGround = luminance(design.backgroundColor) < 0.45;

  rect(p, 0, 0, width, p.H, { color: ground });
  drawTopRow(p, labels, darkGround ? brand.logoLight : brand.logoInk, assets.eventLogo, 34, width, darkGround ? ON_DARK_MUTED : MUTED);

  // De tegel: affiche en titel in één witte kaart.
  const cardX = M;
  const cardTop = 72;
  const cardWidth = width - M * 2;
  const radius = 13;
  const posterHeight = cardWidth / RATIO[design.posterRatio];

  const titleMax = cardWidth - 44 - (design.showDatePin ? 70 : 0);
  const title = titleLines(p, content.eventTitle, titleMax, 25, 15);
  const titleLead = title.size * 1.12;
  const metaLines = [content.date, design.showLocation && content.location ? content.location : null].filter((line): line is string => Boolean(line));
  const bodyHeight = 26 + title.lines.length * titleLead + 14 + metaLines.length * 15 + 16;
  const cardHeight = posterHeight + bodyHeight;

  rounded(p, cardX, cardTop, cardWidth, cardHeight, radius, { color: WHITE });
  if (assets.artwork) {
    drawCover(p, assets.artwork, cardX, cardTop, cardWidth, posterHeight, assets.focal.x, assets.focal.y);
  } else {
    // Zonder affiche en zonder banner het navy vlak van de paginakop, met het patroon erover.
    rect(p, cardX, cardTop, cardWidth, posterHeight, { color: NAVY });
    if (brand.patternWhite) drawPattern(p, brand.patternWhite, cardX, cardTop, cardWidth, posterHeight, 0.2, { x: 120, y: 60 });
    if (brand.logoLight) {
      const h = Math.min(54, posterHeight * 0.32);
      drawContain(p, brand.logoLight, cardX, cardTop + (posterHeight - h) / 2, cardWidth, h, "center");
    }
  }
  roundTopCorners(p, cardX, cardTop, cardWidth, radius, ground);
  rounded(p, cardX, cardTop, cardWidth, cardHeight, radius, { borderColor: LINE, borderWidth: 0.75 });

  if (design.showDatePin) {
    const pin = 56;
    const pinX = cardX + cardWidth - 20 - pin;
    const pinTop = cardTop + posterHeight - pin + 24;
    rect(p, pinX + 1.5, pinTop + 3, pin, pin, { color: NAVY, opacity: 0.12 });
    rect(p, pinX, pinTop, pin, pin, { color: accent });
    const on = textOn(design.accentColor);
    const daySize = 22;
    text(p, content.day, pinX + (pin - textWidth(p, content.day, daySize, true)) / 2, pinTop + 30, daySize, { bold: true, color: on });
    text(p, content.month, pinX + (pin - textWidth(p, content.month, 8, true, 0.8)) / 2, pinTop + 44, 8, { bold: true, color: on, spacing: 0.8 });
  }

  // De titel met de streep eronder, precies zo breed als de titel zelf.
  let cursor = cardTop + posterHeight + 26;
  title.lines.forEach((line) => {
    cursor += title.size * 0.86;
    text(p, line, cardX + 22, cursor, title.size, { bold: true, color: ink });
    cursor += titleLead - title.size * 0.86;
  });
  const ruleWidth = Math.max(...title.lines.map((line) => textWidth(p, line, title.size, true)));
  rect(p, cardX + 22, cursor - 2, ruleWidth, 2.4, { color: accent });
  cursor += 14;
  for (const line of metaLines) {
    cursor += 11;
    text(p, truncate(p.fonts.regular, line, 10.5, cardWidth - 44), cardX + 22, cursor, 10.5, { color: BODY });
    cursor += 4;
  }

  // De QR-kaart, met de accentrand links zoals een uitgelichte kaart op de site.
  const footerTop = drawFooter(p, width, content, assets.sponsorLogo, labels.kring, LINE);
  const panelTop = cardTop + cardHeight + 20;
  // De infokolommen enkel als er plaats is: met een hoge affiche (3:2) gaat de
  // ruimte naar de QR, en dan staat de eigen tekst boven de voetregel.
  const roomForInfo = footerTop - 18 - panelTop - (118 + 36) >= INFO_HEIGHT + 24;
  const available = footerTop - 18 - panelTop - (roomForInfo ? INFO_HEIGHT + 24 : 22);
  const qrSize = Math.max(118, Math.min(190, available - 36));
  const panelHeight = qrSize + 36;
  rounded(p, cardX, panelTop, cardWidth, panelHeight, radius, { color: accent });
  rounded(p, cardX + 3.5, panelTop, cardWidth - 3.5, panelHeight, radius, { color: WHITE });
  rounded(p, cardX, panelTop, cardWidth, panelHeight, radius, { borderColor: LINE, borderWidth: 0.75 });
  drawDetails(p, labels, content, cardX + 22, panelTop + 18, cardWidth - 44, qrSize, {
    valueColor: ink,
    rule: LINE,
    statusFill: accent,
    order: "attendee-first",
  });
  if (roomForInfo) drawInfoColumns(p, width, panelTop + panelHeight + 24, labels, content, hex("#C9D0DE"));
  else text(p, truncate(p.fonts.regular, content.note, 8.5, width - M * 2), M, footerTop - 8, 8.5, { color: BODY });
}

// ---------------------------------------------------------------------------
// Printversie: het patroon in lijn
// ---------------------------------------------------------------------------

function drawPrintTicket(p: Painter, design: TicketDesignSnapshot, assets: Assets, brand: Brand, labels: Labels, content: Content) {
  const { width } = p.page.getSize();
  const accent = hex(design.accentColor);

  rect(p, 0, 0, width, p.H, { color: WHITE });

  // De kop: het patroon in dunne lijnen in plaats van een navy vlak.
  const titleMax = width - M * 2;
  const title = titleLines(p, content.eventTitle, titleMax, 32, 18);
  const titleLead = title.size * 1.1;
  const metaLines = [content.date, design.showLocation && content.location ? content.location : null].filter((line): line is string => Boolean(line));
  const headerHeight = 98 + title.lines.length * titleLead + metaLines.length * 16 + 10;

  if (design.printPattern && brand.patternInk) drawPattern(p, brand.patternInk, 0, 0, width, headerHeight, 0.55, { x: 160, y: 100 });
  drawTopRow(p, labels, brand.logoInk, assets.eventLogo, 34, width, BODY);

  // Tekst over het patroon krijgt een wit vlak, zodat geen lijn door een letter loopt.
  const knock = (value: string, x: number, baseline: number, size: number, bold: boolean) => {
    if (!design.printPattern) return;
    rect(p, x - 4, baseline - size * 0.82, textWidth(p, value, size, bold) + 8, size * 1.08, { color: WHITE });
  };
  let cursor = 92;
  title.lines.forEach((line) => {
    cursor += title.size * 0.86;
    knock(line, M, cursor, title.size, true);
    text(p, line, M, cursor, title.size, { bold: true, color: INK });
    cursor += titleLead - title.size * 0.86;
  });
  cursor += 6;
  for (const line of metaLines) {
    cursor += 12;
    const value = truncate(p.fonts.regular, line, 11.5, titleMax);
    knock(value, M, cursor, 11.5, false);
    text(p, value, M, cursor, 11.5, { color: BODY });
    cursor += 4;
  }

  rect(p, 0, headerHeight, width, 1.5, { color: INK });
  if (design.printAccent) rect(p, 0, headerHeight + 1.5, width, 3, { color: accent });

  // De kaart met de QR: enkel een lijn, geen vlak.
  const footerTop = drawFooter(p, width, content, assets.sponsorLogo, labels.kring, INK);
  const cardTop = headerHeight + 30;
  const available = footerTop - 24 - INFO_HEIGHT - 24 - cardTop;
  const qrSize = Math.max(140, Math.min(225, available - 42));
  const cardHeight = qrSize + 42;
  rounded(p, M, cardTop, width - M * 2, cardHeight, 13, { borderColor: INK, borderWidth: 0.9 });
  drawDetails(p, labels, content, M + 21, cardTop + 21, width - M * 2 - 42, qrSize, {
    valueColor: INK,
    rule: INK,
    statusFill: null,
    order: "type-first",
  });

  drawInfoColumns(p, width, cardTop + cardHeight + 24, labels, content, INK);
}

// ---------------------------------------------------------------------------

export async function generateTicketsPdf(input: TicketPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const locale = input.locale ?? "nl";
  const variant = input.variant ?? "colour";
  const labels = labelsFor(locale);
  const [logoLight, logoInk, patternWhite, patternInk] = await Promise.all([
    loadPublic(document, "vtk-logo.png"),
    loadPublic(document, "ticket-pdf/vtk-logo-ink.png"),
    variant === "colour" ? loadPublic(document, "ticket-pdf/pattern-white.png") : Promise.resolve(null),
    variant === "print" ? loadPublic(document, "ticket-pdf/pattern-ink.png") : Promise.resolve(null),
  ]);
  const brand: Brand = { logoLight, logoInk, patternWhite, patternInk };
  // Eén keer per document: elk ticket zonder eigen affiche krijgt dezelfde banner.
  let banner: Promise<PdfImage | null> | null = null;
  const eventBanner = () => (banner ??= loadBanner(document, input.event.banner?.key));
  const safe = (value: string) => safeText(regular, value);

  const startsAt = input.event.startsAt;
  const dateText = new Intl.DateTimeFormat(labels.intl, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(startsAt);
  const day = new Intl.DateTimeFormat(labels.intl, { day: "numeric", timeZone: "Europe/Brussels" }).format(startsAt);
  const month = new Intl.DateTimeFormat(labels.intl, { month: "short", timeZone: "Europe/Brussels" })
    .format(startsAt)
    .replace(".", "")
    .toUpperCase();

  for (const ticket of input.tickets) {
    const design = withCurrentDefaultColours(ticketDesignSnapshot(ticket.designSnapshot, input.event.id ?? "legacy"));
    const page = document.addPage([A4_PORTRAIT_POINTS.width, A4_PORTRAIT_POINTS.height]);
    const painter: Painter = { page, H: page.getSize().height, fonts: { regular, bold } };
    const [poster, eventLogo, sponsorLogo] = await Promise.all([
      variant === "colour" ? loadAsset(document, design.artwork?.key) : Promise.resolve(null),
      loadAsset(document, design.eventLogoKey),
      loadAsset(document, design.sponsorLogoKey),
    ]);

    const qr = await document.embedPng(await createStyledVtkQrPng(createTicketCredential(ticket.publicId, ticket.qrVersion)));
    const footer = locale === "en" ? design.footerEn ?? design.footerNl : design.footerNl ?? design.footerEn;
    const note = locale === "en" ? design.noteEn ?? design.noteNl : design.noteNl ?? design.noteEn;
    const content: Content = {
      eventTitle: safe(input.event.title),
      date: safe(dateText.charAt(0).toUpperCase() + dateText.slice(1)),
      day,
      month: safe(month),
      location: input.event.location ? safe(input.event.location) : design.showLocation ? labels.locationTbc : null,
      typeName: safe(ticket.typeName),
      attendeeName: safe(ticket.attendeeName),
      price: design.showPrice ? safe(formatMoney(ticket.unitPriceCents, input.currency, labels.intl)) : null,
      orderNumber: design.showOrderNumber ? safe(input.orderNumber) : null,
      ticketId: safe(ticket.publicId),
      status: safe(labels.status(ticket.status ?? "VALID")),
      qr,
      note: safe(note ?? labels.defaultNote),
      footer: footer ? safe(footer) : "",
      revision: labels.revision(design.revision),
    };

    // De affiche van het ontwerp wint; anders de banner van het ticketevent.
    // Ook een affiche die niet te laden is, valt terug op de banner.
    const fallback = !poster && variant === "colour" && input.event.banner ? await eventBanner() : null;
    const assets: Assets = poster
      ? { artwork: poster, focal: { x: design.artwork?.focalX ?? 50, y: design.artwork?.focalY ?? 50 }, eventLogo, sponsorLogo }
      : { artwork: fallback, focal: { x: input.event.banner?.focalX ?? 50, y: input.event.banner?.focalY ?? 50 }, eventLogo, sponsorLogo };
    if (variant === "print") drawPrintTicket(painter, design, assets, brand, labels, content);
    else drawColourTicket(painter, design, assets, brand, labels, content);
  }

  document.setTitle(`${safeText(regular, input.event.title)} - ${input.orderNumber}${variant === "print" ? " (print)" : ""}`);
  document.setAuthor("VTK Leuven");
  document.setCreator("VTK Ticketing");
  document.setSubject("A4 admission ticket");
  return document.save();
}
