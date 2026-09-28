import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import type { CalendarApiEvent } from "@/components/editorial/KalenderEditorialView";
import { eventsRequestKey, openingRange } from "@/components/editorial/calendarGrid";
import { audienceFilter, viewerAudiences, viewerPrefersOwnAudiences } from "@/lib/calendar/audience";
import { publicInterestCounts, viewerInterests } from "@/lib/calendar/interest";
import {
  defaultEventImageFor,
  eventCategorySlugs,
  getDefaultEventImages,
} from "@/lib/defaultEventImage";
import { focusPosition } from "@/lib/imageFocus";
import { publishedTicketSlug } from "@/lib/frontpage/events";
import { getCurrentSession } from "@/lib/session";
import { publicUrl } from "@/lib/storage";

export type CalendarEventsQuery = {
  /** Enkel samen met `end`; zonder bereik komen alle gepubliceerde evenementen terug. */
  start?: Date;
  end?: Date;
  groups?: string[];
  categories?: string[];
  /** Enkel algemene evenementen en die voor de doelgroepen van wie kijkt. */
  onlyMyAudiences?: boolean;
};

/**
 * De evenementen zoals de kalender ze toont, voor wie nu kijkt. Eén bron voor
 * `/api/calendar/events` en voor de eerste weergave die de kalenderpagina al op
 * de server meegeeft; twee kopieën zouden na de eerste wijziging uiteenlopen.
 *
 * Niet cachebaar tussen bezoekers: de eigen keuze (`viewerInterest`) komt uit
 * de sessie of het gastcookie van wie kijkt.
 */
export async function loadCalendarEvents(query: CalendarEventsQuery): Promise<CalendarApiEvent[]> {
  const { start, end, groups = [], categories = [], onlyMyAudiences = false } = query;

  const where: Prisma.CalendarEventWhereInput = {
    publishedAt: { not: null },
  };

  if (start && end) {
    where.start = { lte: end };
    where.end = { gte: start };
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
      // De losse momenten van een evenement dat op meerdere dagen doorgaat
      // zonder ertussen door te lopen; zie `CalendarEventMoment`. De kalender
      // zet het daarmee op elk van die dagen met het juiste uur, in plaats van
      // als één balk over de hele periode.
      moments: { orderBy: { start: "asc" }, select: { start: true, end: true, label: true } },
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
  const [counts, mine, defaultImages] = await Promise.all([
    publicInterestCounts(events.map((e) => e.id)),
    viewerInterests(
      events.map((e) => e.id),
      session?.user.id ?? null,
    ),
    // De lijst onder de kalender toont de cover van het evenement in plaats van
    // een afgekapte beschrijving. Welke foto een evenement zonder eigen cover
    // krijgt, is een instelling (de standaardbanner van zijn thema, en anders de
    // sitebrede uit /admin/home); de browser kan dat niet weten en daarom kiest
    // de server de fallback al.
    getDefaultEventImages(),
  ]);

  return events.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.titleNl,
    titleEn: e.titleEn,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    url: e.url,
    location: e.location,
    moments: e.moments.map((m) => ({
      start: m.start.toISOString(),
      end: m.end.toISOString(),
      label: m.label,
    })),
    extendedProps: {
      groupCode: e.group.code,
      groupSlug: e.group.slug,
      groupNameNl: e.group.nameNl,
      groupNameEn: e.group.nameEn,
      // De organisator wanneer dat niet de beherende groep is. Eén taalloze
      // naam, dus naast de twee groepsnamen en niet in plaats ervan; de
      // kalender kiest zelf welke van de twee hij toont.
      organiserName: e.organiserName,
      descriptionNl: e.descriptionNl,
      descriptionEn: e.descriptionEn,
      categories: e.categories.map((c) => c.category),
      image: publicUrl(e.imageKey) ?? defaultEventImageFor(defaultImages, eventCategorySlugs(e.categories)),
      // Enkel de eigen foto draagt een gekozen uitsnede; de standaardfoto blijft
      // gecentreerd.
      imagePosition: e.imageKey
        ? focusPosition({ x: e.imageFocusX, y: e.imageFocusY })
        : null,
      interestedCount: counts.get(e.id) ?? null,
      viewerInterest: mine.get(e.id) ?? { kind: "none" },
      interested: mine.has(e.id),
      ticketSlug: publishedTicketSlug(e.ticketEvent),
    },
  }));
}

/**
 * Wat de kalender bij het openen toont, al op de server opgehaald. Zonder dit
 * rendert de pagina eerst "Geen evenementen deze maand" en springt ze open zodra
 * de fetch in de browser binnenkomt: dat was een CLS van 0,8 op /kalender.
 *
 * `filter` is `all` of de slug van een categoriepagina, zoals de kalender het
 * zelf uit het pad afleidt.
 *
 * De server rekent en formatteert in zijn eigen tijdzone (`TZ=Europe/Brussels`
 * in de container), de kalender in die van de browser. Voor een bezoeker met
 * een andere UTC-offset (het VK, Portugal, ver buiten Europa) klopt de
 * server-HTML dus niet: React meldt een hydration mismatch, rendert de kalender
 * opnieuw in de browser en haalt het bereik zelf op. Dat is het gedrag van
 * vroeger voor die kleine groep; voor iedereen in CET/CEST staat de kalender er
 * meteen.
 */
export async function loadOpeningCalendarEvents(
  filter: string,
): Promise<{ key: string; events: CalendarApiEvent[] }> {
  const range = openingRange(new Date());
  const onlyMyAudiences = await viewerPrefersOwnAudiences();
  const events = await loadCalendarEvents({
    ...range,
    categories: filter === "all" ? [] : [filter],
    onlyMyAudiences,
  });
  return { key: eventsRequestKey(range, filter, onlyMyAudiences), events };
}
