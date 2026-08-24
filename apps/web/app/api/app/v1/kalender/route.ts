import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { audienceFilter, viewerAudiences } from "@/lib/calendar/audience";
import { listCalendarCategories } from "@/lib/calendar/categories";
import { corsPreflight } from "@/lib/cors";
import { appLocaleFrom, type AppCalendar } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hoeveel evenementen er hoogstens in één antwoord gaan. */
const MAX_EVENTS = 200;

/**
 * De kalender voor de app.
 *
 * Werkt zonder login, net als `/kalender` op de site. Wie wél ingelogd is, krijgt
 * de **doelgroepfilter** mee: een evenement dat enkel voor eerstejaars is, hoort
 * niet bij iedereen in de lijst te staan. Dat is dezelfde regel als op de site en
 * hij komt uit `viewerAudiences()` + `audienceFilter()`; het is een standaard en
 * geen slot, dus `?audience=all` zet hem uit.
 *
 * Parameters: `van` en `tot` (ISO), `categorie` (meerdere mag), `audience=all`.
 * Zonder `van` vertrekt de lijst vanaf nu; dat is wat een app openen betekent.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));
    const from = parseDate(url.searchParams.get("van")) ?? new Date();
    const to = parseDate(url.searchParams.get("tot"));
    const categories = url.searchParams.getAll("categorie").filter(Boolean);
    const showAll = url.searchParams.get("audience") === "all";

    const where: Prisma.CalendarEventWhereInput = {
      visibility: "PUBLIC",
      publishedAt: { not: null },
      // Een evenement dat bezig is, hoort er nog bij te staan; daarom `end` en
      // niet `start`. Zonder dat verdwijnt een festival op zijn tweede dag.
      end: { gte: from },
      ...(to ? { start: { lte: to } } : {}),
    };

    if (categories.length > 0) {
      where.categories = { some: { category: { slug: { in: categories } } } };
    }

    // Wie expliciet om een categorie vraagt, krijgt ze ook als het een
    // doelgroepcategorie is: die lijst ís dan de eerstejaarskalender.
    const filteredByAudience = !showAll && categories.length === 0;
    if (filteredByAudience) {
      Object.assign(where, audienceFilter(await viewerAudiences()));
    }

    const [events, allCategories] = await Promise.all([
      prisma.calendarEvent.findMany({
        where,
        orderBy: { start: "asc" },
        take: MAX_EVENTS,
        include: {
          group: { select: { slug: true, nameNl: true, nameEn: true } },
          categories: {
            select: {
              category: {
                select: { slug: true, nameNl: true, nameEn: true, colour: true, audience: true },
              },
            },
            orderBy: { category: { order: "asc" } },
          },
        },
      }),
      listCalendarCategories(),
    ]);

    const payload: AppCalendar = {
      filteredByAudience,
      categories: allCategories.map((category) => ({
        slug: category.slug,
        name: pick(category.nameNl, category.nameEn, locale) ?? category.nameNl,
        colour: category.colour,
        audience: category.audience,
      })),
      events: events.map((event) => ({
        id: event.id,
        title: pick(event.titleNl, event.titleEn, locale) ?? event.titleNl,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        allDay: event.allDay,
        location: event.location,
        imageUrl: absoluteMediaUrl(request, event.imageKey),
        groupName: pick(event.group.nameNl, event.group.nameEn, locale) ?? event.group.nameNl,
        groupSlug: event.group.slug,
        categories: event.categories.map(({ category }) => ({
          slug: category.slug,
          name: pick(category.nameNl, category.nameEn, locale) ?? category.nameNl,
          colour: category.colour,
          audience: category.audience,
        })),
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/** Een ongeldige datum telt als "niet meegegeven", niet als een fout. */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
