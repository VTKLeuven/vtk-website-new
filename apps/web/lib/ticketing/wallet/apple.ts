import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { PKPass } from "passkit-generator";
import { getObjectBuffer } from "@vtk/storage";
import { createTicketCredential } from "../crypto";
import { formatMoney } from "../money";
import { ticketDesignSnapshot, type TicketDesignSnapshot } from "../design";
import { appleWalletConfig } from "./config";
import type { WalletTicketInput } from "./types";

async function loadLogoSource(design: TicketDesignSnapshot): Promise<Buffer> {
  if (design.eventLogoKey) {
    try {
      return await getObjectBuffer(design.eventLogoKey);
    } catch (error) {
      console.warn("Wallet logo asset unavailable, falling back to VTK shield", { key: design.eventLogoKey, error });
    }
  }
  // Same default mark as the PDF ticket: every pass carries VTK branding even
  // when an event never uploaded its own logo.
  return readFileSync(join(process.cwd(), "public", "vtk-shield-favicon.png"));
}

function squareIcon(source: Buffer, size: number): Promise<Buffer> {
  return sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function fittedLogo(source: Buffer, height: number): Promise<Buffer> {
  return sharp(source)
    .resize({ height, fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function hexToRgbString(value: string): string {
  const parsed = Number.parseInt(value.slice(1), 16);
  return `rgb(${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255})`;
}

/** An event ticket's strip is 375x144pt when the barcode is square, which
 * ours always is (QR). Apple crops anything off-ratio itself, so do the crop
 * here instead, honouring the same focal point the PDF uses; otherwise a
 * portrait photo would be centre-cropped and lose whatever the admin aimed at. */
const STRIP_ASPECT = 375 / 144;

export async function stripImage(source: Buffer, focalX: number, focalY: number, scale: number): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(source).metadata();
  if (!width || !height) throw new Error("UNREADABLE_ARTWORK");
  const cropWidth = Math.min(width, Math.round(height * STRIP_ASPECT));
  const cropHeight = Math.min(height, Math.round(width / STRIP_ASPECT));
  const left = Math.round((width - cropWidth) * (focalX / 100));
  const top = Math.round((height - cropHeight) * (focalY / 100));
  return sharp(source)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(375 * scale, 144 * scale)
    .png()
    .toBuffer();
}

/** Returns the three strip resolutions, or `null` when the event has no
 * artwork or it cannot be read: a pass without a strip is a perfectly valid
 * pass, so bad artwork must never fail the whole download. */
async function stripImages(design: TicketDesignSnapshot): Promise<Record<string, Buffer> | null> {
  if (!design.artwork?.key) return null;
  try {
    const source = await getObjectBuffer(design.artwork.key);
    const focalX = design.artwork.focalX ?? 50;
    const focalY = design.artwork.focalY ?? 50;
    const [x1, x2, x3] = await Promise.all([
      stripImage(source, focalX, focalY, 1),
      stripImage(source, focalX, focalY, 2),
      stripImage(source, focalX, focalY, 3),
    ]);
    return { "strip.png": x1, "strip@2x.png": x2, "strip@3x.png": x3 };
  } catch (error) {
    console.warn("Wallet strip artwork unavailable", { key: design.artwork.key, error });
    return null;
  }
}

export function isAppleWalletAvailable(): boolean {
  return appleWalletConfig() !== null;
}

/** Builds a signed .pkpass. Generated fresh per request (like the PDF and
 * unlike a "real" wallet integration): no push-update web service, so an
 * already-added pass will not live-refresh if the event's design or details
 * change later. Adding that is a separate, optional piece of Apple Wallet
 * infrastructure (APNs + a pass-update REST service) intentionally left out
 * of this first version; see docs/design-decisions.md. */
export async function generateAppleWalletPass(input: WalletTicketInput): Promise<Buffer> {
  const config = appleWalletConfig();
  if (!config) throw new Error("APPLE_WALLET_NOT_CONFIGURED");

  const design = ticketDesignSnapshot(input.designSnapshot, input.event.id ?? "legacy");
  const logoSource = await loadLogoSource(design);
  const [icon1x, icon2x, icon3x, logo1x, logo2x, strips] = await Promise.all([
    squareIcon(logoSource, 29),
    squareIcon(logoSource, 58),
    squareIcon(logoSource, 87),
    fittedLogo(logoSource, 50),
    fittedLogo(logoSource, 100),
    stripImages(design),
  ]);

  const pass = new PKPass(
    {
      "icon.png": icon1x,
      "icon@2x.png": icon2x,
      "icon@3x.png": icon3x,
      "logo.png": logo1x,
      "logo@2x.png": logo2x,
      ...(strips ?? {}),
    },
    {
      wwdr: config.wwdrPem,
      signerCert: config.signerCertPem,
      signerKey: config.signerKeyPem,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
    {
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamId,
      organizationName: config.organizationName,
      description: `${input.event.title} - ${input.orderNumber}`,
      serialNumber: input.ticketId,
      logoText: "VTK",
      backgroundColor: hexToRgbString(design.backgroundColor),
      foregroundColor: hexToRgbString(design.textColor),
      labelColor: hexToRgbString(design.accentColor),
    }
  );

  pass.type = "eventTicket";
  pass.setBarcodes({
    message: createTicketCredential(input.publicId, input.qrVersion),
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
  });
  pass.setRelevantDate(input.event.startsAt);
  // A day of slack after the event: attendees who screenshot-check the pass
  // the morning after shouldn't find it already greyed out.
  pass.setExpirationDate(new Date(input.event.startsAt.getTime() + 24 * 60 * 60 * 1000));

  pass.primaryFields.push({ key: "event", label: "EVENT", value: input.event.title });
  pass.secondaryFields.push(
    {
      key: "date",
      label: "DATUM / DATE",
      value: input.event.startsAt,
      dateStyle: "PKDateStyleFull",
      timeStyle: "PKDateStyleShort",
    },
    { key: "location", label: "LOCATIE / LOCATION", value: input.event.location || "Locatie wordt nog bevestigd" }
  );
  pass.auxiliaryFields.push(
    { key: "type", label: "TICKETTYPE", value: input.typeName },
    { key: "attendee", label: "DEELNEMER / ATTENDEE", value: input.attendeeName }
  );
  pass.backFields.push(
    { key: "orderNumber", label: "BESTELNUMMER / ORDER NUMBER", value: input.orderNumber },
    { key: "price", label: "PRIJS / PRICE", value: formatMoney(input.unitPriceCents, input.currency, "nl-BE") },
    { key: "ticketId", label: "TICKET-ID", value: input.publicId }
  );
  const footer = [design.footerNl, design.footerEn].filter(Boolean).join("\n\n");
  if (footer) pass.backFields.push({ key: "terms", label: "INFO", value: footer });

  return pass.getAsBuffer();
}
