import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { createTicketCredential } from "./crypto";
import { formatMoney } from "./money";

export type TicketPdfInput = {
  orderNumber: string;
  currency: string;
  event: {
    title: string;
    startsAt: Date;
    location: string | null;
  };
  tickets: Array<{
    publicId: string;
    qrVersion: number;
    attendeeName: string;
    typeName: string;
    unitPriceCents: number;
  }>;
};

function drawFittedText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  preferredSize: number,
  minSize: number,
  color = rgb(0.04, 0.06, 0.12)
) {
  let size = preferredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  page.drawText(text, { x, y, size, font, color, maxWidth });
}

export async function generateTicketsPdf(input: TicketPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  for (const ticket of input.tickets) {
    const page = document.addPage([595.28, 419.53]);
    const { width, height } = page.getSize();
    const credential = createTicketCredential(ticket.publicId, ticket.qrVersion);
    const qrPng = await QRCode.toBuffer(credential, {
      type: "png",
      width: 640,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0A0F1F", light: "#FFFFFF" },
    });
    const qr = await document.embedPng(qrPng);

    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.98, 0.98, 0.96) });
    page.drawRectangle({ x: 0, y: height - 22, width, height: 22, color: rgb(1, 0.82, 0.25) });
    page.drawRectangle({
      x: 28,
      y: 28,
      width: width - 56,
      height: height - 78,
      borderColor: rgb(0.82, 0.83, 0.84),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    page.drawText("VTK", { x: 52, y: height - 74, size: 17, font: bold });
    page.drawText("TOEGANGSTICKET", {
      x: 52,
      y: height - 94,
      size: 8,
      font: bold,
      color: rgb(0.36, 0.4, 0.5),
    });
    drawFittedText(page, input.event.title, 52, height - 145, 315, bold, 29, 18);

    const date = new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Brussels",
    }).format(input.event.startsAt);
    page.drawText(date, { x: 52, y: height - 178, size: 11, font: regular });
    page.drawText(input.event.location || "Locatie wordt nog bevestigd", {
      x: 52,
      y: height - 198,
      size: 11,
      font: regular,
      color: rgb(0.2, 0.25, 0.35),
    });

    page.drawText("TICKETTYPE", {
      x: 52,
      y: 146,
      size: 8,
      font: bold,
      color: rgb(0.36, 0.4, 0.5),
    });
    drawFittedText(page, ticket.typeName, 52, 128, 250, bold, 13, 10);
    page.drawText("DEELNEMER", {
      x: 52,
      y: 100,
      size: 8,
      font: bold,
      color: rgb(0.36, 0.4, 0.5),
    });
    drawFittedText(page, ticket.attendeeName, 52, 81, 250, bold, 13, 10);
    page.drawText(`${formatMoney(ticket.unitPriceCents, input.currency, "nl-BE")}  |  ${input.orderNumber}`, {
      x: 52,
      y: 56,
      size: 9,
      font: regular,
      color: rgb(0.36, 0.4, 0.5),
    });

    page.drawImage(qr, { x: width - 198, y: 82, width: 142, height: 142 });
    page.drawText(`ID ${ticket.publicId}`, {
      x: width - 198,
      y: 62,
      size: 7,
      font: regular,
      color: rgb(0.36, 0.4, 0.5),
    });
  }

  document.setTitle(`${input.event.title} - ${input.orderNumber}`);
  document.setAuthor("VTK Leuven");
  document.setCreator("VTK Ticketing");
  return document.save();
}
