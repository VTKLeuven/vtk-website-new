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
} from "pdf-lib";
import { getObjectBuffer } from "@vtk/storage";
import { createStyledVtkQrPng } from "@/lib/shortlink-qr";
import { createTicketCredential } from "./crypto";
import { ticketDesignSnapshot, type TicketDesignSnapshot } from "./design";
import { formatMoney } from "./money";

export const A4_PORTRAIT_POINTS = { width: 595.28, height: 841.89 } as const;

export type TicketPdfInput = {
  orderNumber: string;
  currency: string;
  event: {
    id?: string;
    title: string;
    startsAt: Date;
    location: string | null;
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

const PAPER = rgb(0.976, 0.976, 0.973);
const INK = rgb(0.04, 0.06, 0.12);
const LINE = rgb(0.87, 0.88, 0.9);

function colour(value: string) {
  const parsed = Number.parseInt(value.slice(1), 16);
  return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

function luminance(value: string) {
  const parsed = Number.parseInt(value.slice(1), 16);
  return (0.2126 * ((parsed >> 16) & 255) + 0.7152 * ((parsed >> 8) & 255) + 0.0722 * (parsed & 255)) / 255;
}

function readableTextColour(value: string) {
  // The system panel is white; prevent a light custom text colour from making
  // attendee data unreadable while retaining every sensible selected colour.
  return luminance(value) > 0.78 ? INK : colour(value);
}

/** Guarantees contrast against a solid fill of `value` itself, for text drawn
 * directly on a band coloured with the admin's chosen text colour. */
function onFillTextColour(value: string) {
  return luminance(value) > 0.5 ? INK : PAPER;
}

/** Shrinks to fit, then truncates with an ellipsis rather than letting pdf-lib
 * wrap onto a second line: every caller stacks a fixed-height element right
 * below this text, so a wrapped second line would silently overlap it. */
function drawFittedText(
  page: PdfPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PdfFont,
  preferredSize: number,
  minSize: number,
  textColour = INK,
  opacity = 1
) {
  let size = preferredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  let fitted = text;
  while (fitted.length > 1 && font.widthOfTextAtSize(fitted, size) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  if (fitted !== text) {
    fitted = `${fitted.trimEnd()}…`;
    while (fitted.length > 1 && font.widthOfTextAtSize(fitted, size) > maxWidth) {
      fitted = `${fitted.slice(0, -2).trimEnd()}…`;
    }
  }
  page.drawText(fitted, { x, y, size, font, color: textColour, opacity });
}

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

/** The VTK shield, embedded once per document and reused as the default event
 * mark whenever an event has not uploaded its own logo. Every ticket carries
 * VTK branding out of the box instead of shipping blank. */
async function loadDefaultShield(document: PdfDoc): Promise<PdfImage | null> {
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "vtk-shield-favicon.png"));
    return await document.embedPng(bytes);
  } catch (error) {
    console.warn("Default VTK shield unavailable", { error });
    return null;
  }
}

function drawCover(page: PdfPage, image: PdfImage, x: number, y: number, width: number, height: number, focalX: number, focalY: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  const excessX = Math.max(0, drawnWidth - width);
  const excessY = Math.max(0, drawnHeight - height);
  const drawX = x - excessX * (focalX / 100);
  const drawY = y - excessY * (focalY / 100);
  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
  page.drawImage(image, { x: drawX, y: drawY, width: drawnWidth, height: drawnHeight });
  page.pushOperators(popGraphicsState());
}

function drawContain(page: PdfPage, image: PdfImage, x: number, y: number, width: number, height: number, opacity = 1) {
  const scale = Math.min(width / image.width, height / image.height, 1);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - drawnWidth) / 2,
    y: y + (height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
    opacity,
  });
}

const MARGIN = 48;

/** Revision 0 only ever reaches the renderer through the admin preview of an
 * unpublished draft, so calling it "v0" would invent a version that no ticket
 * carries. */
function revisionLabel(revision: number): string {
  return revision === 0 ? "Ontwerp: concept" : `Ontwerp v${revision}`;
}

/** The default template: a dark header band (VTK's own navy/yellow system)
 * carries the shield, event title and schedule, so a ticket looks branded and
 * finished before any admin uploads custom artwork. The QR/details card sits
 * directly beneath it instead of anchored to the bottom of an otherwise empty
 * A4 page. */
function drawClassicTicket(
  page: PdfPage,
  design: TicketDesignSnapshot,
  artwork: PdfImage | null,
  logo: PdfImage | null,
  sponsorLogo: PdfImage | null,
  fonts: { regular: PdfFont; bold: PdfFont },
  content: {
    eventTitle: string;
    date: string;
    location: string;
    typeName: string;
    attendeeName: string;
    priceLine: string;
    ticketId: string;
    status: string;
    qr: PdfImage;
    footer: string;
    revision: number;
  }
) {
  const { width, height } = page.getSize();
  const { regular, bold } = fonts;
  const accent = colour(design.accentColor);
  const bandFill = colour(design.textColor);
  const bandText = onFillTextColour(design.textColor);
  const bodyText = readableTextColour(design.textColor);

  const bandHeight = 214;
  const ruleHeight = 5;
  const bandBottom = height - bandHeight;

  page.drawRectangle({ x: 0, y: 0, width, height, color: colour(design.backgroundColor) });

  // A faint shield watermark keeps the lower page from reading as an empty
  // void once the card above it has already said everything that matters.
  if (logo) {
    const size = 230;
    drawContain(page, logo, (width - size) / 2, MARGIN, size, size, 0.045);
  }

  if (artwork) {
    // Same idea as the site's hero: a full-bleed photo under a navy scrim, so
    // uploaded artwork and the flat-colour fallback share one text treatment.
    drawCover(page, artwork, 0, bandBottom, width, bandHeight, design.artwork?.focalX ?? 50, design.artwork?.focalY ?? 50);
    page.drawRectangle({ x: 0, y: bandBottom, width, height: bandHeight, color: bandFill, opacity: 0.72 });
  } else {
    page.drawRectangle({ x: 0, y: bandBottom, width, height: bandHeight, color: bandFill });
  }
  page.drawRectangle({ x: 0, y: bandBottom - ruleHeight, width, height: ruleHeight, color: accent });

  if (logo) drawContain(page, logo, MARGIN, height - MARGIN - 42, 42, 42);
  page.drawText("VTK", { x: MARGIN + 56, y: height - 74, size: 21, font: bold, color: bandText });
  page.drawText("TOEGANGSTICKET  /  ADMISSION", { x: MARGIN + 56, y: height - 90, size: 7.5, font: bold, color: accent });

  drawFittedText(page, content.eventTitle, MARGIN, height - 136, width - MARGIN * 2, bold, 25, 17, bandText);
  page.drawText(content.date, { x: MARGIN, y: height - 166, size: 11, font: regular, color: bandText, opacity: 0.86 });
  page.drawText(content.location, { x: MARGIN, y: height - 184, size: 11, font: regular, color: bandText, opacity: 0.86 });

  const cardTop = bandBottom - ruleHeight - 34;
  const cardHeight = 246;
  const cardBottom = cardTop - cardHeight;
  const cardX = MARGIN;
  const cardWidth = width - MARGIN * 2;
  page.drawRectangle({ x: cardX, y: cardBottom, width: cardWidth, height: cardHeight, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 1 });

  const padding = 26;
  const qrSize = 150;
  const qrX = cardX + padding;
  const qrY = cardBottom + padding + 34;
  page.drawText("SCAN BIJ INGANG  /  SCAN AT ENTRANCE", { x: qrX, y: qrY + qrSize + 12, size: 6.5, font: bold, color: accent });
  page.drawImage(content.qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  page.drawText(`ID ${content.ticketId}`, { x: qrX, y: qrY - 15, size: 7.5, font: regular, color: rgb(0.12, 0.16, 0.22) });
  page.drawText(`STATUS ${content.status}`, { x: qrX, y: qrY - 25, size: 6.5, font: bold, color: rgb(0.12, 0.16, 0.22) });

  const detailsX = qrX + qrSize + 30;
  const detailsWidth = cardX + cardWidth - padding - detailsX;
  page.drawText("TICKETTYPE", { x: detailsX, y: cardTop - 34, size: 7.5, font: bold, color: accent });
  drawFittedText(page, content.typeName, detailsX, cardTop - 52, detailsWidth, bold, 14, 9, bodyText);
  page.drawText("DEELNEMER", { x: detailsX, y: cardTop - 84, size: 7.5, font: bold, color: accent });
  drawFittedText(page, content.attendeeName, detailsX, cardTop - 102, detailsWidth, bold, 14, 9, bodyText);
  page.drawText(content.priceLine, { x: detailsX, y: cardTop - 134, size: 9, font: regular, color: bodyText });

  if (content.footer) {
    page.drawText(content.footer, { x: cardX, y: 78, maxWidth: cardWidth - (sponsorLogo ? 132 : 0), size: 8, lineHeight: 10, font: regular, color: bodyText });
  }
  if (sponsorLogo) drawContain(page, sponsorLogo, cardX + cardWidth - 112, 42, 112, 38);
  page.drawText(revisionLabel(content.revision), { x: cardX, y: 22, size: 6.5, font: regular, color: rgb(0.45, 0.49, 0.56) });
}

function contentBox(design: TicketDesignSnapshot, width: number, height: number) {
  // POSTER_ARTWORK's info block and QR block are independently anchored to the
  // top and bottom of this box; too tall a box (a 48pt gap under the artwork
  // banner) leaves too little room between the two and the location line runs
  // into the QR frame.
  if (design.template === "POSTER_ARTWORK") return { x: 46, y: 110, width: width - 92, top: height - 372 };
  return { x: width * 0.43 + 38, y: 110, width: width * 0.57 - 76, top: height - 72 };
}

function drawArtworkTicket(
  page: PdfPage,
  design: TicketDesignSnapshot,
  artwork: PdfImage | null,
  logo: PdfImage | null,
  sponsorLogo: PdfImage | null,
  fonts: { regular: PdfFont; bold: PdfFont },
  content: {
    eventTitle: string;
    date: string;
    location: string;
    typeName: string;
    attendeeName: string;
    priceLine: string;
    ticketId: string;
    status: string;
    qr: PdfImage;
    footer: string;
    revision: number;
  }
) {
  const { width, height } = page.getSize();
  const { regular, bold } = fonts;
  page.drawRectangle({ x: 0, y: 0, width, height, color: colour(design.backgroundColor) });
  if (design.template === "POSTER_ARTWORK") {
    if (artwork) drawCover(page, artwork, 0, height - 348, width, 348, design.artwork?.focalX ?? 50, design.artwork?.focalY ?? 50);
    else page.drawRectangle({ x: 0, y: height - 348, width, height: 348, color: colour(design.accentColor) });
    page.drawRectangle({ x: 0, y: height - 348, width, height: 9, color: colour(design.accentColor) });
  } else {
    if (artwork) drawCover(page, artwork, 0, 0, width * 0.43, height, design.artwork?.focalX ?? 50, design.artwork?.focalY ?? 50);
    else page.drawRectangle({ x: 0, y: 0, width: width * 0.43, height, color: colour(design.accentColor) });
    page.drawRectangle({ x: width * 0.43, y: 0, width: 9, height, color: colour(design.accentColor) });
  }

  const box = contentBox(design, width, height);
  const textColour = readableTextColour(design.textColor);
  // A translucent-looking (but actually opaque) white system panel retains
  // predictable contrast over every admin-provided artwork.
  page.drawRectangle({ x: box.x - 18, y: box.y - 20, width: box.width + 36, height: box.top - box.y + 38, color: rgb(1, 1, 1), opacity: 0.94 });
  const logoSize = 26;
  if (logo) drawContain(page, logo, box.x, box.top - logoSize, logoSize, logoSize);
  const wordmarkX = box.x + (logo ? logoSize + 10 : 0);
  page.drawText("VTK", { x: wordmarkX, y: box.top - 19, size: 13, font: bold, color: textColour });
  page.drawText("TOEGANGSTICKET  /  ADMISSION", { x: wordmarkX, y: box.top - 35, size: 7.5, font: bold, color: colour(design.accentColor) });

  const titleY = box.top - 88;
  drawFittedText(page, content.eventTitle, box.x, titleY, box.width - 6, bold, 27, 17, textColour);
  page.drawText(content.date, { x: box.x, y: titleY - 31, size: 10.5, font: regular, color: textColour });
  page.drawText(content.location, { x: box.x, y: titleY - 49, size: 10.5, font: regular, color: textColour });

  const qrSize = 142;
  const qrX = box.x;
  const qrY = box.y + 38;
  page.drawRectangle({ x: qrX - 12, y: qrY - 32, width: qrSize + 24, height: qrSize + 56, color: rgb(1, 1, 1), borderColor: rgb(0.06, 0.08, 0.12), borderWidth: 1 });
  page.drawImage(content.qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  page.drawText(`ID ${content.ticketId}`, { x: qrX, y: qrY - 17, size: 7.5, font: regular, color: rgb(0.12, 0.16, 0.22) });
  page.drawText(`STATUS ${content.status}`, { x: qrX, y: qrY - 27, size: 6.5, font: bold, color: rgb(0.12, 0.16, 0.22) });

  const detailsX = qrX + qrSize + 34;
  const detailsWidth = box.x + box.width - detailsX;
  page.drawText("TICKETTYPE", { x: detailsX, y: qrY + 116, size: 7.5, font: bold, color: colour(design.accentColor) });
  drawFittedText(page, content.typeName, detailsX, qrY + 96, detailsWidth, bold, 13, 9, textColour);
  page.drawText("DEELNEMER", { x: detailsX, y: qrY + 65, size: 7.5, font: bold, color: colour(design.accentColor) });
  drawFittedText(page, content.attendeeName, detailsX, qrY + 45, detailsWidth, bold, 13, 9, textColour);
  page.drawText(content.priceLine, { x: detailsX, y: qrY + 10, size: 8.5, font: regular, color: textColour });

  if (content.footer) page.drawText(content.footer, { x: box.x, y: 64, maxWidth: box.width - (sponsorLogo ? 132 : 0), size: 8, lineHeight: 10, font: regular, color: textColour });
  if (sponsorLogo) drawContain(page, sponsorLogo, box.x + box.width - 112, 42, 112, 38);
  page.drawText(revisionLabel(content.revision), { x: box.x, y: 27, size: 6.5, font: regular, color: rgb(0.35, 0.39, 0.46) });
}

export async function generateTicketsPdf(input: TicketPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const defaultShield = await loadDefaultShield(document);

  for (const ticket of input.tickets) {
    const design = ticketDesignSnapshot(ticket.designSnapshot, input.event.id ?? "legacy");
    const page = document.addPage([A4_PORTRAIT_POINTS.width, A4_PORTRAIT_POINTS.height]);
    const [artwork, eventLogo, sponsorLogo] = await Promise.all([
      loadAsset(document, design.artwork?.key),
      loadAsset(document, design.eventLogoKey),
      loadAsset(document, design.sponsorLogoKey),
    ]);
    const logo = eventLogo ?? defaultShield;

    const date = new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Brussels",
    }).format(input.event.startsAt);
    const credential = createTicketCredential(ticket.publicId, ticket.qrVersion);
    const qrPng = await createStyledVtkQrPng(credential);
    const qr = await document.embedPng(qrPng);
    const content = {
      eventTitle: input.event.title,
      date,
      location: input.event.location || "Locatie wordt nog bevestigd",
      typeName: ticket.typeName,
      attendeeName: ticket.attendeeName,
      priceLine: `${formatMoney(ticket.unitPriceCents, input.currency, "nl-BE")}  |  ${input.orderNumber}`,
      ticketId: ticket.publicId,
      status: (ticket.status ?? "VALID").replaceAll("_", " "),
      qr,
      footer: [design.footerNl, design.footerEn].filter(Boolean).join("\n"),
      revision: design.revision,
    };

    if (design.template === "CLASSIC") {
      drawClassicTicket(page, design, artwork, logo, sponsorLogo, { regular, bold }, content);
    } else {
      drawArtworkTicket(page, design, artwork, logo, sponsorLogo, { regular, bold }, content);
    }
  }

  document.setTitle(`${input.event.title} - ${input.orderNumber}`);
  document.setAuthor("VTK Leuven");
  document.setCreator("VTK Ticketing");
  document.setSubject("A4 admission ticket");
  return document.save();
}
