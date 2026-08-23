import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { audienceFilter, viewerAudiences } from "@/lib/calendar/audience";

// Leest de sessie om de doelgroepen van de kijker te bepalen, dus per definitie
// niet statisch te renderen.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const groups = url.searchParams.getAll("group").filter(Boolean);
  const categories = url.searchParams.getAll("category").filter(Boolean);
  // Standaard toont de publieke kalender alles. Personalisatie is opt-in: met
  // `audience=mine` blijven algemene events en doelgroepevents voor dit profiel.
  const onlyMyAudiences = url.searchParams.get("audience") === "mine";

  const where: Prisma.CalendarEventWhereInput = {
    visibility: "PUBLIC",
    publishedAt: { not: null },
  };

  if (start && end) {
    where.start = { lte: new Date(end) };
    where.end = { gte: new Date(start) };
  }

  if (groups.length > 0) {
    where.group = { code: { in: groups as never } };
  }

  // Categorie en groep zijn twee losse assen: wie op beide filtert, krijgt de
  // doorsnede. De kalenderpagina gebruikt enkel `category`.
  if (categories.length > 0) {
    where.categories = { some: { category: { slug: { in: categories } } } };
  }

  // Een expliciete doelgroepfilter (bv. alumni) is preciezer dan profielmatching:
  // die pagina/filter moet ook bruikbaar zijn voor iemand buiten de doelgroep.
  if (onlyMyAudiences && categories.length === 0) {
    Object.assign(where, audienceFilter(await viewerAudiences()));
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    include: {
      group: true,
      categories: {
        select: {
          category: {
            select: { slug: true, nameNl: true, nameEn: true, colour: true, audience: true },
          },
        },
        orderBy: { category: { order: "asc" } },
      },
    },
    orderBy: { start: "asc" },
  });

  const payload = events.map((e) => ({
    id: e.id,
    title: e.titleNl,
    titleEn: e.titleEn,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    url: e.url,
    location: e.location,
    extendedProps: {
      groupCode: e.group.code,
      groupSlug: e.group.slug,
      groupNameNl: e.group.nameNl,
      groupNameEn: e.group.nameEn,
      descriptionNl: e.descriptionNl,
      descriptionEn: e.descriptionEn,
      categories: e.categories.map((c) => c.category),
    },
  }));

  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
