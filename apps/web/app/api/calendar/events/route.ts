import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { audienceFilter, viewerAudiences } from "@/lib/calendar/audience";
import { publicInterestCounts, viewerInterests } from "@/lib/calendar/interest";
import { getCurrentSession } from "@/lib/session";

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

  // Enkel de tellers die de drempel halen komen terug; een laag getal verlaat de
  // server dus niet eens. Zie lib/calendar/interest.ts.
  //
  // De eigen keuze en per-event alumnigegevens gaan mee, zodat de modal niet
  // alleen de juiste ster toont maar ook meteen het alumniblok kan invullen.
  // `viewerInterests` geeft uitsluitend de rij van de huidige sessie of het
  // huidige gastcookie terug.
  const session = await getCurrentSession();
  const [counts, mine] = await Promise.all([
    publicInterestCounts(events.map((e) => e.id)),
    viewerInterests(
      events.map((e) => e.id),
      session?.user.id ?? null,
    ),
  ]);

  const payload = events.map((e) => ({
    id: e.id,
    slug: e.slug,
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
      interestedCount: counts.get(e.id) ?? null,
      viewerInterest: mine.get(e.id) ?? { kind: "none" },
      interested: mine.has(e.id),
    },
  }));

  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
