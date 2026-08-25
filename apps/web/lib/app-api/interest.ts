import "server-only";

import { prisma } from "@vtk/db";

import { audienceFilter, viewerAudiences } from "@/lib/calendar/audience";

/**
 * Interesse in een evenement, en gevolgde categorieën.
 *
 * Twee verschillende dingen die makkelijk verward worden:
 *
 * - **Interesse** is per evenement en zegt "ik ga hier waarschijnlijk naartoe".
 *   Het maakt je eigen lijst en het hangt de herinnering van die dag eraan.
 *   Het is **geen inschrijving**: er hangt geen plaats aan, niemand ziet wie het
 *   aanduidde, en het geeft je geen ticket. Dat onderscheid moet in de app ook
 *   zichtbaar blijven, anders staat er iemand voor een uitverkochte zaal met een
 *   ster in zijn telefoon.
 * - **Een categorie volgen** is per categorie en zegt "laat het weten wanneer er
 *   iets bijkomt". Dat is het enige pushbericht dat geen "je moet nu iets doen"
 *   is, en het mag precies omdat het lid er zelf om vroeg.
 *
 * Een lid kan enkel interesse aanduiden in een evenement dat het ook mag zien:
 * gepubliceerd, publiek, en binnen zijn doelgroep. Zonder die controle zou de
 * ster een manier zijn om te achterhalen welke id's bestaan.
 */

/** Of dit evenement zichtbaar is voor wie nu kijkt. */
export async function eventIsVisible(eventId: string): Promise<boolean> {
  const audiences = await viewerAudiences();
  const count = await prisma.calendarEvent.count({
    where: {
      id: eventId,
      visibility: "PUBLIC",
      publishedAt: { not: null },
      ...audienceFilter(audiences),
    },
  });
  return count > 0;
}

export async function setEventInterest(
  userId: string,
  eventId: string,
  interested: boolean,
): Promise<void> {
  if (!interested) {
    await prisma.calendarEventInterest.deleteMany({ where: { userId, eventId } });
    return;
  }

  if (!(await eventIsVisible(eventId))) throw new Error("NOT_FOUND");

  // Twee keer op de ster tikken hoort niets te doen, niet te falen.
  await prisma.calendarEventInterest.upsert({
    where: { userId_eventId: { userId, eventId } },
    update: {},
    create: { userId, eventId },
  });
}

/** De id's van de evenementen waarin dit lid interesse aanduidde, uit een set. */
export async function interestedEventIds(
  userId: string | null,
  eventIds: string[],
): Promise<Set<string>> {
  if (!userId || eventIds.length === 0) return new Set();
  const rows = await prisma.calendarEventInterest.findMany({
    where: { userId, eventId: { in: eventIds } },
    select: { eventId: true },
  });
  return new Set(rows.map((row) => row.eventId));
}

export async function followedCategorySlugs(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const rows = await prisma.calendarCategoryFollow.findMany({
    where: { userId },
    select: { category: { select: { slug: true } } },
  });
  return rows.map((row) => row.category.slug);
}

export async function setCategoryFollow(
  userId: string,
  slug: string,
  follow: boolean,
): Promise<void> {
  const category = await prisma.calendarCategory.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!category) throw new Error("NOT_FOUND");

  if (!follow) {
    await prisma.calendarCategoryFollow.deleteMany({ where: { userId, categoryId: category.id } });
    return;
  }

  await prisma.calendarCategoryFollow.upsert({
    where: { userId_categoryId: { userId, categoryId: category.id } },
    update: {},
    create: { userId, categoryId: category.id },
  });
}
