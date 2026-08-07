"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requireSession } from "@/lib/session";
import {
  createCalendarFeedToken,
  hashCalendarFeedToken,
  MAX_ACTIVE_CALENDAR_FEED_TOKENS,
} from "@/lib/calendar/feedToken";

export type CreateCalendarFeedTokenResult =
  | { ok: true; url: string }
  | { ok: false; error: "invalid_label" | "too_many_tokens" };

function revalidateAccount() {
  revalidatePath("/account");
  revalidatePath("/en/account");
}

/**
 * Maakt een persoonlijke feed-URL. De ruwe waarde verlaat deze action exact één
 * keer: daarna staat enkel de hash in de database, dus een verloren link kan je
 * niet terugvinden, enkel opnieuw aanmaken.
 */
export async function createCalendarFeedTokenAction(
  formData: FormData,
): Promise<CreateCalendarFeedTokenResult> {
  const session = await requireSession();
  const label = String(formData.get("label") ?? "").trim().replace(/\s+/g, " ");
  if (label.length < 1 || label.length > 80) return { ok: false, error: "invalid_label" };

  const activeCount = await prisma.calendarFeedToken.count({
    where: { userId: session.user.id, revokedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_CALENDAR_FEED_TOKENS) {
    return { ok: false, error: "too_many_tokens" };
  }

  const token = createCalendarFeedToken();
  await prisma.calendarFeedToken.create({
    data: { userId: session.user.id, label, tokenHash: hashCalendarFeedToken(token) },
  });

  revalidateAccount();
  return { ok: true, url: `/api/calendar/feed/me/${token}` };
}

/**
 * Trekt een feed in. We verwijderen de rij niet: `revokedAt` houdt zichtbaar dat
 * de link ooit bestond, en de unieke hash blijft bezet zodat exact dezelfde
 * waarde nooit hergebruikt kan worden.
 */
export async function revokeCalendarFeedTokenAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = formData.get("id") as string;
  if (!id) return;

  // De where-clausule draagt de userId mee, zodat een gegokte id van iemand
  // anders niets doet in plaats van diens feed in te trekken.
  await prisma.calendarFeedToken.updateMany({
    where: { id, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidateAccount();
}
