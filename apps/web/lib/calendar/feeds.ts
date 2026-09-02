import "server-only";

import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { markdownToPlainText } from "@/lib/markdown";
import { audienceFilter, audienceFilterForUser } from "./audience";
import { buildIcs, type IcsCalendar, type IcsEvent } from "./ics";

/**
 * Welke events een feed bevat. `personal` is de enige die ledenexclusieve
 * (MEMBERS) events meeneemt; een publieke feed-URL is per definitie deelbaar.
 */
export type FeedScope =
  | { kind: "all" }
  | { kind: "category"; slug: string }
  /**
   * Een zelfgekozen samenstelling: nul of meer categorieën, eventueel samen met
   * de algemene evenementen (die zonder doelgroepcategorie).
   *
   * Bestaat omdat "enkel alumni" en "alles" allebei het verkeerde antwoord zijn
   * voor een alumnus: hij wil de alumni-activiteiten én de fuiven en cantussen
   * waar iedereen welkom is, maar niet de eerstejaarsdoop. Zonder deze scope zou
   * hij zich op twee feeds moeten abonneren en in zijn agenda-app zelf moeten
   * uitzoeken welke van de twee hij nu weer had.
   */
  | { kind: "mix"; slugs: string[]; includeGeneral: boolean }
  | { kind: "group"; slug: string }
  | { kind: "personal"; userId: string };

/**
 * Een feed draagt een venster, geen volledige historiek: agenda-clients halen het
 * bestand elk paar uur opnieuw op, dus tien jaar oude fuiven meesturen kost enkel
 * bandbreedte. Een jaar terug houdt "waar was ik vorig semester?" bruikbaar.
 */
const PAST_MONTHS = 12;
const FUTURE_MONTHS = 24;

export function feedWindow(now = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setMonth(from.getMonth() - PAST_MONTHS);
  const to = new Date(now);
  to.setMonth(to.getMonth() + FUTURE_MONTHS);
  return { from, to };
}

/** Absolute basis-URL van de site, zoals lib/sso.ts en lib/ticketing/config.ts hem lezen. */
export function siteBaseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Publieke URL van een evenement, in de taal van de feed.
 *
 * De URL-naam en niet de id: dit adres komt in de agenda van een lid terecht en
 * blijft daar staan. De UID hieronder blijft wel de id, want die is de sleutel
 * waarop een agenda-client een bestaande afspraak herkent.
 */
export function eventUrl(slug: string, locale: Locale): string {
  return `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/kalender/${slug}`;
}

type EventRow = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  updatedAt: Date;
  categories: { category: { nameNl: string; nameEn: string } }[];
};

const eventSelect = {
  id: true,
  slug: true,
  titleNl: true,
  titleEn: true,
  descriptionNl: true,
  descriptionEn: true,
  location: true,
  start: true,
  end: true,
  allDay: true,
  updatedAt: true,
  categories: { select: { category: { select: { nameNl: true, nameEn: true } } } },
} as const;

function toIcsEvent(event: EventRow, locale: Locale): IcsEvent {
  const description = pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale);
  return {
    uid: `${event.id}@vtk.be`,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    summary: pick(event.titleNl, event.titleEn, locale),
    description: description ? markdownToPlainText(description) : null,
    location: event.location,
    url: eventUrl(event.slug, locale),
    categories: event.categories.map((c) => pick(c.category.nameNl, c.category.nameEn, locale)),
    updatedAt: event.updatedAt,
  };
}

/**
 * Bouwt de kalender voor een scope, of `null` wanneer een categorie of post uit
 * de URL niet bestaat; de route maakt daar een 404 van. Enkel de scopes die een
 * naam uit de URL opzoeken kunnen zo ontbreken, dus de overloads houden dat
 * zichtbaar in het type: de routes die niet kunnen falen hoeven geen null-check
 * te faken.
 *
 * De persoonlijke feed voegt naast de events ook de shiften toe waarvoor het lid
 * is ingeschreven.
 */
export async function buildFeed(
  scope: { kind: "all" } | { kind: "personal"; userId: string },
  locale: Locale,
  now?: Date,
): Promise<string>;
export async function buildFeed(
  scope: FeedScope,
  locale: Locale,
  now?: Date,
): Promise<string | null>;
export async function buildFeed(
  scope: FeedScope,
  locale: Locale,
  now = new Date(),
): Promise<string | null> {
  const { from, to } = feedWindow(now);
  const window = { start: { lte: to }, end: { gte: from } };

  switch (scope.kind) {
    case "all": {
      // De hoofdkalender toont en publiceert standaard alle publieke events.
      // Wie één doelgroep wil, gebruikt de categoriefeed van die doelgroep.
      const events = await prisma.calendarEvent.findMany({
        where: {
          publishedAt: { not: null },
          ...window,
        },
        select: eventSelect,
        orderBy: { start: "asc" },
      });
      return render(
        { name: "VTK", description: locale === "nl" ? "Alle VTK-evenementen" : "All VTK events" },
        events,
        locale,
        `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/kalender`,
        now,
      );
    }

    case "category": {
      const category = await prisma.calendarCategory.findUnique({
        where: { slug: scope.slug },
        select: { slug: true, nameNl: true, nameEn: true, descriptionNl: true, descriptionEn: true },
      });
      if (!category) return null;
      const events = await prisma.calendarEvent.findMany({
        where: {
          publishedAt: { not: null },
          categories: { some: { category: { slug: scope.slug } } },
          ...window,
        },
        select: eventSelect,
        orderBy: { start: "asc" },
      });
      const description = pick(category.descriptionNl ?? "", category.descriptionEn ?? "", locale);
      return render(
        {
          name: `VTK ${pick(category.nameNl, category.nameEn, locale)}`,
          description: description ? markdownToPlainText(description) : undefined,
        },
        events,
        locale,
        `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/kalender/${category.slug}`,
        now,
      );
    }

    case "mix": {
      // Een lege selectie zonder algemene events zou een lege kalender opleveren
      // die er in een agenda-app uitziet als een kapot abonnement; dan is "alles"
      // het eerlijkere antwoord.
      if (scope.slugs.length === 0 && !scope.includeGeneral) {
        return buildFeed({ kind: "all" }, locale, now);
      }

      const categories = await prisma.calendarCategory.findMany({
        where: { slug: { in: scope.slugs } },
        select: { slug: true, nameNl: true, nameEn: true },
        orderBy: { order: "asc" },
      });
      // Eén onbekende slug betekent een verkeerd overgetikte URL; dan liever een
      // 404 dan stilzwijgend een kalender met minder erin dan gevraagd.
      if (categories.length !== new Set(scope.slugs).size) return null;

      const events = await prisma.calendarEvent.findMany({
        where: {
          publishedAt: { not: null },
          ...window,
          OR: [
            ...(scope.includeGeneral
              ? [{ categories: { none: { category: { audience: { not: null } } } } }]
              : []),
            ...(scope.slugs.length > 0
              ? [{ categories: { some: { category: { slug: { in: scope.slugs } } } } }]
              : []),
          ],
        },
        select: eventSelect,
        orderBy: { start: "asc" },
      });

      const generalLabel = locale === "nl" ? "Algemeen" : "General";
      const parts = [
        ...(scope.includeGeneral ? [generalLabel] : []),
        ...categories.map((c) => pick(c.nameNl, c.nameEn, locale)),
      ];
      return render(
        { name: `VTK ${parts.join(" + ")}` },
        events,
        locale,
        `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/kalender`,
        now,
      );
    }

    case "group": {
      const group = await prisma.group.findUnique({
        where: { slug: scope.slug },
        select: { id: true, slug: true, nameNl: true, nameEn: true },
      });
      if (!group) return null;
      const events = await prisma.calendarEvent.findMany({
        where: {
          publishedAt: { not: null },
          groupId: group.id,
          ...window,
          ...audienceFilter([]),
        },
        select: eventSelect,
        orderBy: { start: "asc" },
      });
      return render(
        { name: `VTK ${pick(group.nameNl, group.nameEn, locale)}` },
        events,
        locale,
        `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/kalender`,
        now,
      );
    }

    case "personal": {
      // De persoonlijke feed onderscheidt zich van de publieke door de shiften
      // eronder. De doelgroepen staan er standaard allemaal op; enkel wie op
      // /account koos zijn kalender toe te spitsen, krijgt hier minder.
      const audienceWhere = await audienceFilterForUser(scope.userId);
      const [events, shifts] = await Promise.all([
        prisma.calendarEvent.findMany({
          where: { publishedAt: { not: null }, ...window, ...audienceWhere },
          select: eventSelect,
          orderBy: { start: "asc" },
        }),
        prisma.shiftParticipant.findMany({
          where: { userId: scope.userId, shift: { startTime: { lte: to }, endTime: { gte: from } } },
          select: {
            shift: {
              select: {
                id: true,
                name: true,
                location: true,
                description: true,
                startTime: true,
                endTime: true,
              },
            },
          },
        }),
      ]);

      const icsEvents = events.map((e) => toIcsEvent(e, locale));
      for (const { shift } of shifts) {
        icsEvents.push({
          uid: `shift-${shift.id}@vtk.be`,
          start: shift.startTime,
          end: shift.endTime,
          allDay: false,
          // `Shift.name` staat maar in één taal in de database, dus die naam
          // verschijnt in beide feeds ongewijzigd.
          summary: `Shift: ${shift.name}`,
          description: shift.description || null,
          location: shift.location || null,
          url: `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/shift`,
          categories: [locale === "nl" ? "Shiften" : "Shifts"],
          // `Shift` heeft geen `updatedAt`; de starttijd is het beste signaal dat
          // we hebben, en die verandert wanneer de shift verzet wordt.
          updatedAt: shift.startTime,
          private: true,
        });
      }
      icsEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

      return buildIcs(
        {
          name: locale === "nl" ? "Mijn VTK" : "My VTK",
          description:
            locale === "nl"
              ? "Je persoonlijke VTK-agenda: ledenevenementen en je shiften."
              : "Your personal VTK calendar: member events and your shifts.",
          url: `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/kalender`,
          events: icsEvents,
        },
        now,
      );
    }
  }
}

/**
 * Eén evenement als los .ics-bestand, voor de downloadknop op de eventpagina.
 * Alleen publieke events, net als die pagina zelf: `/kalender/<slug>` toont een
 * MEMBERS-event aan niemand.
 *
 * Neemt een URL-naam of een id, net als de pagina. `filename` is de naam van het
 * gedownloade bestand en staat los van de URL-naam: hij komt uit de titel in de
 * taal van de bezoeker, zodat een Engelstalige de Engelse titel op zijn schijf
 * ziet staan.
 */
export async function buildEventIcs(
  slugOrId: string,
  locale: Locale,
  now = new Date(),
): Promise<{ body: string; filename: string } | null> {
  const event = await prisma.calendarEvent.findFirst({
    where: { publishedAt: { not: null }, OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: eventSelect,
  });
  if (!event) return null;

  const title = pick(event.titleNl, event.titleEn, locale);
  return {
    body: buildIcs(
      { name: title, url: eventUrl(event.slug, locale), events: [toIcsEvent(event, locale)] },
      now,
    ),
    filename: slugifyForFilename(title) || "vtk-event",
  };
}

/** Maakt van een eventtitel een veilige bestandsnaam voor de Content-Disposition. */
function slugifyForFilename(title: string): string {
  return title
    .normalize("NFD")
    // Combinerende accenten (U+0300-U+036F) wegstrepen, zodat "Café" -> "cafe".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function render(
  meta: { name: string; description?: string },
  events: EventRow[],
  locale: Locale,
  url: string,
  now: Date,
): string {
  const calendar: IcsCalendar = {
    ...meta,
    url,
    events: events.map((e) => toIcsEvent(e, locale)),
  };
  return buildIcs(calendar, now);
}
