import "server-only";

import { cookies, headers } from "next/headers";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { secureTokenHash, verifyOrderAccessToken } from "./crypto";
import { orderAccessCookieName } from "./access";

/** Shared by every per-ticket download route (PDF, Apple/Google Wallet):
 * either the order-access cookie set when the buyer opened their tickets
 * link, or the buyer's own session, or a superadmin. */
export async function resolveAuthorizedTicket(ticketId: string) {
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
  if (!tokenValid && !owner) return null;
  return { ticket, order };
}
