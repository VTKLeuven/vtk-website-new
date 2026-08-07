import "server-only";

import jwt from "jsonwebtoken";
import { createTicketCredential } from "../crypto";
import { formatMoney } from "../money";
import { ticketDesignSnapshot } from "../design";
import { absoluteLogoUrl } from "./assets";
import { googleWalletConfig } from "./config";
import type { WalletTicketInput } from "./types";

export function isGoogleWalletAvailable(): boolean {
  return googleWalletConfig() !== null;
}

/** Google Wallet lets a "Save" JWT carry the full class + object definition
 * inline (`eventTicketClasses`/`eventTicketObjects`), so this needs only a
 * signed JWT, no prior REST call to register the class. Google upserts both
 * the first time someone actually saves the pass. */
export function generateGoogleWalletSaveUrl(input: WalletTicketInput): string {
  const config = googleWalletConfig();
  if (!config) throw new Error("GOOGLE_WALLET_NOT_CONFIGURED");

  const design = ticketDesignSnapshot(input.designSnapshot, input.event.id ?? "legacy");
  const eventId = input.event.id ?? "legacy";
  const classId = `${config.issuerId}.vtk-event-${eventId}`;
  const objectId = `${config.issuerId}.vtk-ticket-${input.ticketId}`;
  const logoUri = absoluteLogoUrl(design);
  const location = input.event.location || "Locatie wordt nog bevestigd / Location to be confirmed";
  const footer = [design.footerNl, design.footerEn].filter(Boolean).join(" / ");

  const eventTicketClass = {
    id: classId,
    issuerName: "VTK Leuven",
    eventName: { defaultValue: { language: "nl", value: input.event.title } },
    venue: {
      name: { defaultValue: { language: "nl", value: "VTK Leuven" } },
      address: { defaultValue: { language: "nl", value: location } },
    },
    dateTime: { start: input.event.startsAt.toISOString() },
    logo: { sourceUri: { uri: logoUri } },
    hexBackgroundColor: design.backgroundColor,
    // New classes start under review; the direct "Save" link already works
    // while that's pending, they just won't surface in Wallet's own search.
    reviewStatus: "UNDER_REVIEW",
  };

  const eventTicketObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    ticketHolderName: input.attendeeName,
    ticketNumber: input.publicId,
    hexBackgroundColor: design.backgroundColor,
    barcode: {
      type: "QR_CODE",
      value: createTicketCredential(input.publicId, input.qrVersion),
    },
    textModulesData: [
      { id: "type", header: "TICKETTYPE", body: input.typeName },
      { id: "order", header: "BESTELNUMMER / ORDER", body: input.orderNumber },
      { id: "price", header: "PRIJS / PRICE", body: formatMoney(input.unitPriceCents, input.currency, "nl-BE") },
      ...(footer ? [{ id: "info", header: "INFO", body: footer }] : []),
    ],
  };

  const payload = {
    iss: config.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: {
      eventTicketClasses: [eventTicketClass],
      eventTicketObjects: [eventTicketObject],
    },
  };

  const token = jwt.sign(payload, config.privateKey, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${token}`;
}
