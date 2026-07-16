import "server-only";

import { createHash } from "node:crypto";

export function orderAccessCookieName(orderId: string): string {
  const suffix = createHash("sha256").update(orderId).digest("hex").slice(0, 24);
  return `vtk_ticket_order_${suffix}`;
}

export function orderAccessCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function orderAccessExpiry(eventEndsAt: Date, now = new Date()): Date {
  const sevenDays = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAfterEvent = eventEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000;
  return new Date(Math.max(sevenDays, thirtyDaysAfterEvent));
}
