import "server-only";

import { cookies, headers } from "next/headers";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { createTicketLinkToken, secureTokenHash, verifyOrderAccessToken, verifyTicketLinkToken } from "./crypto";
import { orderAccessCookieName } from "./access";

/** Hoe lang een ondertekende link uit de app geldig blijft. De app haalt haar
 * lijst opnieuw op bij het openen, maar kan dagen in het geheugen blijven. */
const TICKET_LINK_DAYS = 14;

/**
 * Een pad naar de PDF of de wallet van een ticket met `?t=` erbij, voor waar
 * geen sessie meegaat (de in-app browser van de app). Zie
 * `createTicketLinkToken`.
 */
export function signedTicketPath(path: string, ticketId: string, credentialVersion: number, now = new Date()): string {
  const expiresAt = new Date(now.getTime() + TICKET_LINK_DAYS * 24 * 60 * 60 * 1000);
  const token = createTicketLinkToken(ticketId, credentialVersion, expiresAt);
  return `${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
}

/** Shared by every per-ticket download route (PDF, Apple/Google Wallet):
 * either the order-access cookie set when the buyer opened their tickets
 * link, or the buyer's own session, or a superadmin, or a signed link from
 * the app (`?t=`, `signedTicketPath`). */
export async function resolveAuthorizedTicket(ticketId: string, linkToken?: string | null) {
  const [session, cookieStore] = await Promise.all([getSession(await headers()), cookies()]);
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { event: true, orderItem: { include: { order: true } } },
  });
  if (!ticket) return null;
  const order = ticket.orderItem.order;
  const access = cookieStore.get(orderAccessCookieName(order.id))?.value;
  const tokenValid = Boolean(
    access &&
      order.accessExpiresAt > new Date() &&
      secureTokenHash(access) === order.accessTokenHash &&
      verifyOrderAccessToken(access, order.id)
  );
  const owner = session?.user.id === order.buyerUserId || session?.user.isSuperAdmin;
  const linkValid = Boolean(linkToken && verifyTicketLinkToken(linkToken, ticket.id, ticket.credentialVersion));
  if (!tokenValid && !owner && !linkValid) return null;
  return { ticket, order };
}
