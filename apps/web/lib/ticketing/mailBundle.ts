import "server-only";

import type { Prisma } from "@prisma/client";
import type { MailAttachment, OrderMailContents } from "./mail";
import { generateTicketsPdf } from "./pdf";
import {
  getAppleWalletPass,
  getGoogleWalletSaveUrl,
  isAppleWalletAvailable,
  isGoogleWalletAvailable,
  type WalletTicketInput,
} from "./wallet";

/**
 * De bijlagen bij de bevestigingsmail: de pdf met alle tickets, en per ticket
 * een pas voor Apple Wallet. Google Wallet kan geen bestand zijn (een pas komt
 * daar via een save-link), dus die gaat als knop in de mail.
 *
 * De link naar de ticketpagina blijft de hoofdweg: die volgt de laatste stand
 * van zaken (ingetrokken, terugbetaald, nieuwe qr na een reset), terwijl een
 * bijlage de toestand van het moment van versturen is. De bijlagen zijn er voor
 * de praktijk aan de deur: geen bereik, een lege batterij, of iemand die zijn
 * ticket liever afdrukt.
 *
 * Alles hier is best effort. Een pdf-generator of wallet-provider die stukloopt
 * mag de bevestiging niet tegenhouden: dan vertrekt de mail met wat er wel is,
 * en de tekst zegt enkel wat er echt bij zit. Anders loopt de outbox vol
 * mislukte pogingen en krijgt de koper helemaal niets, wat al eens gebeurd is.
 */

type OrderForMail = Prisma.TicketOrderGetPayload<{
  include: { event: true; items: { include: { ticket: true } } };
}>;

/**
 * Boven deze grens weigeren mailservers de boodschap. Gmail en Office 365 laten
 * 25 MB toe, maar dat is na base64-codering (een derde groter); 8 MB ruw houdt
 * ons daar ruim onder, ook wanneer een ontwerp met een zware achtergrondfoto in
 * elk ticket zit.
 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/**
 * Boven dit aantal tickets laten we de wallet-passen weg. Elke pas is een
 * aparte aanroep bij de provider, en een bestelling van dertig tickets is
 * er een voor een groep: die persoon deelt de tickets via de link door, en
 * heeft geen dertig passen in zijn eigen wallet nodig.
 */
export const MAX_WALLET_PASSES = 8;

/** Bestandsnamen belanden in de mailbox van de koper; hou ze saai en veilig. */
export function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/** Past deze bijlage er nog bij? */
export function withinBudget(current: MailAttachment[], next: number): boolean {
  const used = current.reduce((total, attachment) => total + attachment.content.length, 0);
  return used + next <= MAX_ATTACHMENT_BYTES;
}

type Attachable = {
  ticket: NonNullable<OrderForMail["items"][number]["ticket"]>;
  item: OrderForMail["items"][number];
};

/**
 * Enkel geldige tickets. Een ingetrokken of terugbetaald ticket hoort niet als
 * bijlage in een mailbox te blijven hangen: aan de deur is het geweigerd, en de
 * bijlage zou het tegendeel suggereren.
 */
export function attachableTickets(order: OrderForMail): Attachable[] {
  return order.items.flatMap((item) =>
    item.ticket && item.ticket.status === "VALID" ? [{ ticket: item.ticket, item }] : []
  );
}

function eventTitle(order: OrderForMail): string {
  return order.locale === "EN" && order.event.titleEn ? order.event.titleEn : order.event.titleNl;
}

function walletInput(order: OrderForMail, entry: Attachable): WalletTicketInput {
  return {
    ticketId: entry.ticket.id,
    publicId: entry.ticket.publicCode,
    qrVersion: entry.ticket.credentialVersion,
    attendeeName: entry.item.attendeeName,
    typeName: entry.item.ticketTypeName,
    unitPriceCents: entry.item.totalCents,
    status: entry.ticket.status,
    designSnapshot: entry.ticket.designSnapshot,
    event: {
      id: order.event.id,
      title: eventTitle(order),
      startsAt: order.event.startsAt,
      location: order.event.location,
      latitude: order.event.locationLatitude,
      longitude: order.event.locationLongitude,
    },
    orderNumber: order.reference,
    currency: order.currency,
  };
}

/**
 * Het label op een Google Wallet-knop. Bij één ticket volstaat "Google Wallet";
 * bij meerdere moet de koper zien welke knop bij wie hoort, anders zijn het vier
 * identieke knoppen onder elkaar. De merknaam blijft in beide talen dezelfde.
 */
export function walletLinkLabel(attendeeName: string, ticketCount: number): string {
  return ticketCount === 1 ? "Google Wallet" : `Google Wallet: ${attendeeName}`;
}

export async function orderMailBundle(
  order: OrderForMail
): Promise<{ attachments: MailAttachment[]; contents: OrderMailContents }> {
  const tickets = attachableTickets(order);
  const attachments: MailAttachment[] = [];
  const contents: OrderMailContents = { pdf: false, applePasses: 0, googleLinks: [] };
  if (tickets.length === 0) return { attachments, contents };

  const slug = safeFilename(order.event.slug);

  try {
    const pdf = await generateTicketsPdf({
      orderNumber: order.reference,
      currency: order.currency,
      event: {
        id: order.event.id,
        title: eventTitle(order),
        startsAt: order.event.startsAt,
        location: order.event.location,
      },
      tickets: tickets.map((entry) => ({
        publicId: entry.ticket.publicCode,
        qrVersion: entry.ticket.credentialVersion,
        attendeeName: entry.item.attendeeName,
        typeName: entry.item.ticketTypeName,
        unitPriceCents: entry.item.totalCents,
        status: entry.ticket.status,
        designSnapshot: entry.ticket.designSnapshot,
      })),
    });
    if (withinBudget(attachments, pdf.length)) {
      attachments.push({
        filename: safeFilename(`${slug}-${order.reference}.pdf`),
        content: Buffer.from(pdf),
        contentType: "application/pdf",
      });
      contents.pdf = true;
    }
  } catch (error) {
    console.error(`[ticket-mail] pdf-bijlage mislukt voor ${order.reference}:`, error);
  }

  if (tickets.length > MAX_WALLET_PASSES) return { attachments, contents };

  if (isAppleWalletAvailable()) {
    for (const entry of tickets) {
      try {
        const pass = await getAppleWalletPass(walletInput(order, entry));
        if (!withinBudget(attachments, pass.length)) break;
        attachments.push({
          filename: safeFilename(`${slug}-${entry.ticket.publicCode}.pkpass`),
          content: pass,
          contentType: "application/vnd.apple.pkpass",
        });
        contents.applePasses += 1;
      } catch (error) {
        console.error(
          `[ticket-mail] apple wallet-pas mislukt voor ${entry.ticket.publicCode}:`,
          error
        );
      }
    }
  }

  if (isGoogleWalletAvailable()) {
    for (const entry of tickets) {
      try {
        const url = await getGoogleWalletSaveUrl(walletInput(order, entry));
        contents.googleLinks.push({
          label: walletLinkLabel(entry.item.attendeeName, tickets.length),
          url,
        });
      } catch (error) {
        console.error(
          `[ticket-mail] google wallet-link mislukt voor ${entry.ticket.publicCode}:`,
          error
        );
      }
    }
  }

  return { attachments, contents };
}
