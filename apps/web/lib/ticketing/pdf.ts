import "server-only";

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
import QRCode from "qrcode";
import { getObjectBuffer } from "@vtk/storage";
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

type PdfPage = ReturnType<PDFDocument["addPage"]>;
type PdfFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

function colour(value: string) {
  const parsed = Number.parseInt(value.slice(1), 16);
  return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

function readableTextColour(value: string) {
  const parsed = Number.parseInt(value.slice(1), 16);
  const luminance = (0.2126 * ((parsed >> 16) & 255) + 0.7152 * ((parsed >> 8) & 255) + 0.0722 * (parsed & 255)) / 255;
  // The system panel is white; prevent a light custom text colour from making
  // attendee data unreadable while retaining every sensible selected colour.
  return luminance > 0.78 ? rgb(0.04, 0.06, 0.12) : colour(value);
}

function drawFittedText(
  page: PdfPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PdfFont,
  preferredSize: number,
  minSize: number,
  textColour = rgb(0.04, 0.06, 0.12)
) {
  let size = preferredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  page.drawText(text, { x, y, size, font, color: textColour, maxWidth });
}

async function loadAsset(document: PDFDocument, key: string | undefined) {
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

function drawCover(page: PdfPage, image: NonNullable<Awaited<ReturnType<typeof loadAsset>>>, x: number, y: number, width: number, height: number, focalX: number, focalY: number) {
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

function drawContain(page: PdfPage, image: NonNullable<Awaited<ReturnType<typeof loadAsset>>>, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height, 1);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - drawnWidth) / 2,
    y: y + (height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  });
}

function drawDesignBase(page: PdfPage, design: TicketDesignSnapshot, artwork: NonNullable<Awaited<ReturnType<typeof loadAsset>>> | null) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: colour(design.backgroundColor) });
  if (design.template === "CLASSIC") {
    page.drawRectangle({ x: 0, y: height - 28, width, height: 28, color: colour(design.accentColor) });
    if (artwork) drawCover(page, artwork, 36, height - 248, width - 72, 124, design.artwork?.focalX ?? 50, design.artwork?.focalY ?? 50);
  } else if (design.template === "POSTER_ARTWORK") {
    if (artwork) drawCover(page, artwork, 0, height - 348, width, 348, design.artwork?.focalX ?? 50, design.artwork?.focalY ?? 50);
    else page.drawRectangle({ x: 0, y: height - 348, width, height: 348, color: colour(design.accentColor) });
    page.drawRectangle({ x: 0, y: height - 348, width, height: 9, color: colour(design.accentColor) });
  } else {
    if (artwork) drawCover(page, artwork, 0, 0, width * 0.43, height, design.artwork?.focalX ?? 50, design.artwork?.focalY ?? 50);
    else page.drawRectangle({ x: 0, y: 0, width: width * 0.43, height, color: colour(design.accentColor) });
    page.drawRectangle({ x: width * 0.43, y: 0, width: 9, height, color: colour(design.accentColor) });
  }
}

function contentBox(design: TicketDesignSnapshot, width: number, height: number) {
  if (design.template === "POSTER_ARTWORK") return { x: 46, y: 110, width: width - 92, top: height - 396 };
  if (design.template === "SPLIT_ARTWORK") return { x: width * 0.43 + 38, y: 110, width: width * 0.57 - 76, top: height - 72 };
  return { x: 52, y: 110, width: width - 104, top: height - 76 };
}

export async function generateTicketsPdf(input: TicketPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  for (const ticket of input.tickets) {
    const design = ticketDesignSnapshot(ticket.designSnapshot, input.event.id ?? "legacy");
    const page = document.addPage([A4_PORTRAIT_POINTS.width, A4_PORTRAIT_POINTS.height]);
    const { width, height } = page.getSize();
    const [artwork, eventLogo, sponsorLogo] = await Promise.all([
      loadAsset(document, design.artwork?.key),
      loadAsset(document, design.eventLogoKey),
      loadAsset(document, design.sponsorLogoKey),
    ]);
    drawDesignBase(page, design, artwork);

    const box = contentBox(design, width, height);
    const textColour = readableTextColour(design.textColor);
    // A translucent-looking (but actually opaque) white system panel retains
    // predictable contrast over every admin-provided artwork.
    page.drawRectangle({ x: box.x - 18, y: box.y - 20, width: box.width + 36, height: box.top - box.y + 38, color: rgb(1, 1, 1), opacity: 0.94 });
    if (eventLogo) drawContain(page, eventLogo, box.x, box.top - 42, 120, 30);
    page.drawText("VTK", { x: box.x, y: box.top - 19, size: 13, font: bold, color: textColour });
    page.drawText("TOEGANGSTICKET  /  ADMISSION", { x: box.x, y: box.top - 35, size: 7.5, font: bold, color: colour(design.accentColor) });

    const titleY = box.top - 88;
    drawFittedText(page, input.event.title, box.x, titleY, box.width - 6, bold, 27, 17, textColour);
    const date = new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Brussels",
    }).format(input.event.startsAt);
    page.drawText(date, { x: box.x, y: titleY - 31, size: 10.5, font: regular, color: textColour });
    page.drawText(input.event.location || "Locatie wordt nog bevestigd", { x: box.x, y: titleY - 49, size: 10.5, font: regular, color: textColour });

    const qrSize = 142;
    const qrX = box.x;
    const qrY = box.y + 38;
    page.drawRectangle({ x: qrX - 12, y: qrY - 32, width: qrSize + 24, height: qrSize + 56, color: rgb(1, 1, 1), borderColor: rgb(0.06, 0.08, 0.12), borderWidth: 1 });
    const credential = createTicketCredential(ticket.publicId, ticket.qrVersion);
    const qrPng = await QRCode.toBuffer(credential, { type: "png", width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0A0F1F", light: "#FFFFFF" } });
    const qr = await document.embedPng(qrPng);
    page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText(`ID ${ticket.publicId}`, { x: qrX, y: qrY - 17, size: 7.5, font: regular, color: rgb(0.12, 0.16, 0.22) });
    page.drawText(`STATUS ${(ticket.status ?? "VALID").replaceAll("_", " ")}`, { x: qrX, y: qrY - 27, size: 6.5, font: bold, color: rgb(0.12, 0.16, 0.22) });

    const detailsX = qrX + qrSize + 34;
    const detailsWidth = box.x + box.width - detailsX;
    page.drawText("TICKETTYPE", { x: detailsX, y: qrY + 116, size: 7.5, font: bold, color: colour(design.accentColor) });
    drawFittedText(page, ticket.typeName, detailsX, qrY + 96, detailsWidth, bold, 13, 9, textColour);
    page.drawText("DEELNEMER", { x: detailsX, y: qrY + 65, size: 7.5, font: bold, color: colour(design.accentColor) });
    drawFittedText(page, ticket.attendeeName, detailsX, qrY + 45, detailsWidth, bold, 13, 9, textColour);
    page.drawText(`${formatMoney(ticket.unitPriceCents, input.currency, "nl-BE")}  |  ${input.orderNumber}`, { x: detailsX, y: qrY + 10, size: 8.5, font: regular, color: textColour });

    const footer = [design.footerNl, design.footerEn].filter(Boolean).join("\n");
    if (footer) page.drawText(footer, { x: box.x, y: 64, maxWidth: box.width - (sponsorLogo ? 132 : 0), size: 8, lineHeight: 10, font: regular, color: textColour });
    if (sponsorLogo) drawContain(page, sponsorLogo, box.x + box.width - 112, 42, 112, 38);
    page.drawText(`Ontwerp v${design.revision}`, { x: box.x, y: 27, size: 6.5, font: regular, color: rgb(0.35, 0.39, 0.46) });
  }

  document.setTitle(`${input.event.title} - ${input.orderNumber}`);
  document.setAuthor("VTK Leuven");
  document.setCreator("VTK Ticketing");
  document.setSubject("A4 admission ticket");
  return document.save();
}
