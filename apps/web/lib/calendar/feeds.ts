import "server-only";

import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { markdownToPlainText } from "@/lib/markdown";
import { audienceFilter, audiencesForUser } from "./audience";
import { buildIcs, type IcsCalendar, type IcsEvent } from "./ics";

/**
 * Welke events een feed bevat. `personal` is de enige die ledenexclusieve
 * (MEMBERS) events meeneemt; een publieke feed-URL is per definitie deelbaar.
 */
export type FeedScope =
  | { kind: "all" }
  | { kind: "category"; slug: string }
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

/** Publieke URL van een evenement, in de taal van de feed. */
export function eventUrl(id: string, locale: Locale): string {
  return `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/kalender/${id}`;
}

type EventRow = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  visibility: "PUBLIC" | "MEMBERS";
  updatedAt: Date;
  categories: { category: { nameNl: string; nameEn: string } }[];
};

const eventSelect = {
  id: true,
  titleNl: true,
  titleEn: true,
  descriptionNl: true,
  descriptionEn: true,
  location: true,
  start: true,
  end: true,
  allDay: true,
  visibility: true,
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
    url: eventUrl(event.id, locale),
    categories: event.categories.map((c) => pick(c.category.nameNl, c.category.nameEn, locale)),
    updatedAt: event.updatedAt,
    private: event.visibility === "MEMBERS",
  };
}

/**
 * Bouwt de kalender voor een scope, of `null` wanneer de categorie of post niet
 * bestaat; de route maakt daar een 404 van. Enkel die twee scopes kunnen
 * ontbreken, dus de overloads houden dat zichtbaar in het type: de routes die
 * niet kunnen falen hoeven geen null-check te faken.
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
      // Het algemene programma, dus zonder doelgroepevents: die hebben hun eigen
      // feed (/feed/c/eerstejaars) en horen niet ongevraagd in de agenda van wie
      // op "de VTK-kalender" klikte.
      const events = await prisma.calendarEvent.findMany({
        where: { visibility: "PUBLIC", ...window, ...audienceFilter([]) },
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
        where: { visibility: "PUBLIC", categories: { some: { category: { slug: scope.slug } } }, ...window },
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

    case "group": {
      const group = await prisma.group.findUnique({
        where: { slug: scope.slug },
        select: { id: true, slug: true, nameNl: true, nameEn: true },
      });
      if (!group) return null;
      const events = await prisma.calendarEvent.findMany({
        where: { visibility: "PUBLIC", groupId: group.id, ...window, ...audienceFilter([]) },
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
      // Geen visibility-filter: dit is de enige feed die MEMBERS-events mag
      // dragen. Events waarvoor het lid een ticket heeft, zitten hier dus
      // sowieso al in; ze hoeven niet apart opgehaald te worden. De doelgroepen
      // volgen wél het profiel: een eerstejaars krijgt zijn eerstejaarsevents in
      // deze ene feed, zonder zich apart te moeten abonneren.
      const audiences = await audiencesForUser(scope.userId);
      const [events, shifts] = await Promise.all([
        prisma.calendarEvent.findMany({
          where: { ...window, ...audienceFilter(audiences) },
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
 * Alleen publieke events, net als die pagina zelf: `/kalender/<id>` toont een
 * MEMBERS-event aan niemand.
 */
export async function buildEventIcs(
  id: string,
  locale: Locale,
  now = new Date(),
): Promise<{ body: string; slug: string } | null> {
  const event = await prisma.calendarEvent.findUnique({ where: { id }, select: eventSelect });
  if (!event || event.visibility !== "PUBLIC") return null;

  const title = pick(event.titleNl, event.titleEn, locale);
  return {
    body: buildIcs({ name: title, url: eventUrl(event.id, locale), events: [toIcsEvent(event, locale)] }, now),
    slug: slugifyForFilename(title) || "vtk-event",
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
