import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { viewerAudienceFilter } from "@/lib/calendar/audience";
import { listCalendarCategories } from "@/lib/calendar/categories";
import { corsPreflight } from "@/lib/cors";
import { getCurrentSession } from "@/lib/session";
import { appLocaleFrom, type AppCalendar } from "@/lib/app-api/contract";
import { followedCategorySlugs, interestedEventIds } from "@/lib/app-api/interest";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hoeveel evenementen er hoogstens in één antwoord gaan. */
const MAX_EVENTS = 200;

/**
 * De kalender voor de app.
 *
 * Werkt zonder login, net als `/kalender` op de site, en toont standaard **alles**:
 * een doelgroep is een label, geen slot. Enkel wie op /account koos zijn kalender
 * toe te spitsen (`calendarOnlyMyAudiences`) krijgt de doelgroepfilter mee, via
 * `viewerAudienceFilter()`. `?audience=all` zet ook die voorkeur voor deze ene
 * oproep uit.
 *
 * Parameters: `van` en `tot` (ISO), `categorie` (meerdere mag), `audience=all`,
 * en `interesse=1` voor enkel wat je zelf aanduidde. Zonder `van` vertrekt de
 * lijst vanaf nu; dat is wat een app openen betekent.
 *
 * `interesse=1` negeert de doelgroepfilter met opzet: wat jij ooit aanduidde,
 * hoort in jouw lijst te blijven staan, ook wanneer je studiejaar intussen
 * verschoven is. Anders verdwijnt er een evenement uit je eigen kalender zonder
 * dat je er iets aan gedaan hebt.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));
    const from = parseDate(url.searchParams.get("van")) ?? new Date();
    const to = parseDate(url.searchParams.get("tot"));
    const categories = url.searchParams.getAll("categorie").filter(Boolean);
    const showAll = url.searchParams.get("audience") === "all";
    const onlyInterested = url.searchParams.get("interesse") === "1";
    const session = await getCurrentSession();

    const where: Prisma.CalendarEventWhereInput = {
      publishedAt: { not: null },
      // Een evenement dat bezig is, hoort er nog bij te staan; daarom `end` en
      // niet `start`. Zonder dat verdwijnt een festival op zijn tweede dag.
      end: { gte: from },
      ...(to ? { start: { lte: to } } : {}),
    };

    if (categories.length > 0) {
      where.categories = { some: { category: { slug: { in: categories } } } };
    }

    // Interesse hangt aan een account. Wie niet ingelogd is en toch om zijn
    // eigen lijst vraagt, krijgt een lege lijst en geen fout: de app kan dat
    // scherm tonen met een loginknop erin, en dat leest beter dan een 401.
    if (onlyInterested && !session) {
      return appJson(request, {
        filteredByAudience: false,
        followedCategories: [],
        categories: (await listCalendarCategories()).map((category) => ({
          slug: category.slug,
          name: pick(category.nameNl, category.nameEn, locale) ?? category.nameNl,
          colour: category.colour,
          audience: category.audience,
        })),
        events: [],
      } satisfies AppCalendar);
    }

    if (onlyInterested && session) {
      where.interests = { some: { userId: session.user.id } };
    }

    // Wie expliciet om een categorie vraagt, krijgt ze ook als het een
    // doelgroepcategorie is: die lijst ís dan de eerstejaarskalender.
    //
    // `filteredByAudience` zegt of er effectief iets weggefilterd wórdt, niet of
    // we het geprobeerd hebben. Sinds doelgroepevents standaard voor iedereen
    // zichtbaar zijn, is het filter meestal leeg; zou de vlag dan toch true
    // blijven, dan zet de app een regel onder de lijst die zegt dat er
    // activiteiten ontbreken terwijl er niets ontbreekt.
    const mayFilter = !showAll && !onlyInterested && categories.length === 0;
    const audienceWhere = mayFilter ? await viewerAudienceFilter() : {};
    const filteredByAudience = Object.keys(audienceWhere).length > 0;
    if (filteredByAudience) Object.assign(where, audienceWhere);

    const [events, allCategories, followed] = await Promise.all([
      prisma.calendarEvent.findMany({
        where,
        orderBy: { start: "asc" },
        take: MAX_EVENTS,
        include: {
          group: { select: { slug: true, nameNl: true, nameEn: true } },
          ticketEvent: { select: { slug: true, status: true } },
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
      followedCategorySlugs(session?.user.id ?? null),
    ]);

    const interested = await interestedEventIds(
      session?.user.id ?? null,
      events.map((event) => event.id),
    );

    const payload: AppCalendar = {
      filteredByAudience,
      followedCategories: followed,
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
        interested: interested.has(event.id),
        ticketSlug: event.ticketEvent?.status === "PUBLISHED" ? event.ticketEvent.slug : null,
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
