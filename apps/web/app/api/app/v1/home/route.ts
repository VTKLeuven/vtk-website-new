import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { viewerAudienceFilter } from "@/lib/calendar/audience";
import { corsPreflight } from "@/lib/cors";
import { getCursusdienstHours } from "@/lib/cursusdienstHours";
import { DEFAULT_EVENT_IMAGE_SETTING, BUILTIN_DEFAULT_EVENT_IMAGE } from "@/lib/defaultEventImage";
import { readBarStatus } from "@/lib/elixir/status";
import { frontpagePhoto } from "@/lib/frontpage/registry";
import { resolveFrontpage } from "@/lib/frontpage/resolve";
import { getMediaContent } from "@/lib/media-content";
import {
  entriesForService,
  openingHoursNote,
  readOpeningHoursSetting,
  type OpeningHoursEntry,
  type OpeningHoursService,
} from "@/lib/openingHoursSettings";
import { getCurrentSession } from "@/lib/session";
import { publicUrl } from "@/lib/storage";
import { videoEmbed } from "@/lib/videoEmbed";
import { entryForDate, isClosedHours, isOpenAt } from "@/components/editorial/hoursUtils";
import {
  appLocaleFrom,
  type AppHome,
  type AppLocale,
  type AppOpeningHours,
} from "@/lib/app-api/contract";
import { interestedEventIds } from "@/lib/app-api/interest";
import { absoluteMediaUrl, absoluteUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CareerSetting = {
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  ctaLabelNl?: string;
  ctaLabelEn?: string;
  ctaUrl?: string;
};

/**
 * Het homescherm van de app.
 *
 * Dezelfde inhoud als `HomeEditorial` op de site, en opgebouwd uit dezelfde
 * helpers: het is bewust geen tweede berekening van de openingsuren of van wie
 * welke evenementen mag zien. Waar de site JSX teruggeeft, geeft deze route de
 * gegevens; de app tekent.
 *
 * Werkt zonder login. Twee dingen hangen wel aan de sessie, en allebei om
 * dezelfde reden als op de site: de **doelgroepfilter** op de evenementen (een
 * eerstejaarsevent hoort niet bij iedereen op het scherm) en **jouw POC's**, die
 * per definitie persoonlijk zijn.
 *
 * **Deze route is de vorige vorm van het beginscherm.** De app opent intussen op
 * `/vandaag`; dit blijft staan zolang er toestellen op de oudere versie zitten,
 * want een geïnstalleerde app kan maanden achterlopen. Nieuwe velden komen er
 * enkel bij wanneer het contract ze verplicht maakt.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));
    const now = new Date();

    const [settings, session, cursusEntries, barStatus, media, frontpage, partners] =
      await Promise.all([
        prisma.setting.findMany({
          where: {
            key: {
              in: [
                "home.openingHours.theokot",
                "home.openingHours.cursusdienst",
                "home.openingHours.elixir",
                "home.career",
                DEFAULT_EVENT_IMAGE_SETTING,
              ],
            },
          },
        }),
        getCurrentSession(),
        // Komt live van cudi.vtk.be; deze lezing valt terug op de cache en anders
        // op null, en dan zegt de kaart "niet beschikbaar".
        getCursusdienstHours(locale === "en" ? "en" : "nl"),
        readBarStatus(now),
        getMediaContent(),
        resolveFrontpage(now),
        prisma.partner.findMany({
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          take: 12,
        }),
      ]);

    const map = new Map(settings.map((setting) => [setting.key, setting.value as unknown]));

    // Dezelfde doelgroepfilter als /kalender en als de site zelf.
    const audiences = await viewerAudienceFilter();
    const upcomingEvents = await prisma.calendarEvent.findMany({
      where: {
        start: { gte: now },
        publishedAt: { not: null },
        ...audiences,
      },
      orderBy: { start: "asc" },
      take: 6,
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
    });

    const defaultEventImage =
      publicUrl(
        (map.get(DEFAULT_EVENT_IMAGE_SETTING) as { imageKey?: string | null } | undefined)?.imageKey,
      ) ?? BUILTIN_DEFAULT_EVENT_IMAGE;

    // POC's van jouw richtingen. De richtingen staan in de database en niet in de
    // sessie: `AuthUser` draagt ze niet, en ze daarin zetten zou elke
    // sessie-payload zwaarder maken voor één sectie.
    const programmes = session
      ? ((
          await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { studyProgrammes: true },
          })
        )?.studyProgrammes ?? [])
      : [];

    const pocs =
      programmes.length > 0
        ? await prisma.poc.findMany({
            where: { studyProgrammes: { hasSome: programmes } },
            orderBy: { order: "asc" },
            include: { representatives: { orderBy: { order: "asc" }, include: { user: true } } },
          })
        : [];

    const interested = await interestedEventIds(
      session?.user.id ?? null,
      upcomingEvents.map((event) => event.id),
    );

    const career = map.get("home.career") as CareerSetting | undefined;

    const payload: AppHome = {
      heroPhotoUrl: absoluteUrl(
        request,
        frontpagePhoto(frontpage.module, publicUrl(frontpage.values.photo)),
      ),

      openingHours: {
        theokot: hoursFor(map, "theokot", locale, now),
        elixir: hoursFor(map, "elixir", locale, now),
        cursusdienst: cursusdienstHours(map, cursusEntries, locale, now),
      },

      barStatus: barStatus
        ? {
            isOpen: barStatus.isOpen,
            decibels: barStatus.currentDecibels,
            lastUpdated: new Date(barStatus.lastUpdated).toISOString(),
            stale: barStatus.stale,
          }
        : null,

      upcomingEvents: upcomingEvents.map((event) => ({
        id: event.id,
        title: pick(event.titleNl, event.titleEn, locale) ?? event.titleNl,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        allDay: event.allDay,
        location: event.location,
        imageUrl:
          absoluteMediaUrl(request, event.imageKey) ?? absoluteUrl(request, defaultEventImage),
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

      // Enkel echte embeds: een losse mp4 of een onherkenbare link hoort er niet
      // tussen. De app opent de externe URL, want een speler inbouwen voor zes
      // links naar YouTube is de moeite niet.
      aftermovies: media.videos
        .flatMap((video) => {
          const embed = videoEmbed(video.url, video.posterUrl);
          if (!embed) return [];
          return [
            {
              id: video.id,
              title: pick(video.titleNl, video.titleEn ?? video.titleNl, locale),
              externalUrl: embed.externalUrl,
              posterUrl: embed.posterUrl ?? null,
            },
          ];
        })
        .slice(0, 6),

      career: career
        ? {
            title: pick(career.titleNl, career.titleEn, locale),
            body: pick(career.bodyNl, career.bodyEn, locale),
            ctaLabel: pick(career.ctaLabelNl, career.ctaLabelEn, locale) ?? null,
            ctaUrl: absoluteUrl(request, career.ctaUrl),
          }
        : null,

      // Een POC zonder vertegenwoordigers levert een lege kaart op; die laten we weg.
      pocs: pocs
        .filter((poc) => poc.representatives.length > 0)
        .map((poc) => ({
          id: poc.id,
          name: pick(poc.nameNl, poc.nameEn ?? poc.nameNl, locale),
          email: poc.email,
          people: poc.representatives.map((rep) => ({
            name: rep.user.name,
            role: pick(rep.roleNl, rep.roleEn, locale) || null,
            avatarUrl: absoluteMediaUrl(request, rep.user.avatarKey),
          })),
        })),

      partners: partners.map((partner) => ({
        id: partner.id,
        name: partner.name,
        logoUrl: absoluteMediaUrl(request, partner.logoKey),
        url: partner.url,
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/** De naam zonder "Openingsuren " ervoor; de app zet die kop er zelf boven. */
function serviceName(title: string): string {
  return title.replace(/^Openingsuren\s+/i, "").replace(/\s+opening hours$/i, "");
}

function hoursFor(
  map: Map<string, unknown>,
  service: OpeningHoursService,
  locale: AppLocale,
  now: Date,
): AppOpeningHours {
  const setting = readOpeningHoursSetting(map.get(`home.openingHours.${service}`), service);
  const entries = entriesForService(setting, service, locale);
  const today = entryForDate(entries, now, locale);

  return {
    name: serviceName(pick(setting.titleNl, setting.titleEn, locale)),
    entries: entries.map((entry) => ({
      day: locale === "en" ? entry.dayEn : entry.dayNl,
      hours: entry.hours,
    })),
    today: today
      ? { day: locale === "en" ? today.dayEn : today.dayNl, hours: today.hours }
      : null,
    openNow: Boolean(today && !isClosedHours(today.hours) && isOpenAt(today.hours, now)),
    note: openingHoursNote(setting, locale),
    unavailable: false,
  };
}

/**
 * De cursusdienst is het buitenbeentje: haar uren komen live van cudi.vtk.be en
 * niet uit onze `Setting`. Lukt die lezing niet, dan is `unavailable` waar en
 * toont de app dat in plaats van een leeg rooster, dat als "gesloten" zou lezen.
 */
function cursusdienstHours(
  map: Map<string, unknown>,
  entries: OpeningHoursEntry[] | null,
  locale: AppLocale,
  now: Date,
): AppOpeningHours {
  const setting = readOpeningHoursSetting(map.get("home.openingHours.cursusdienst"), "cursusdienst");
  const name = serviceName(pick(setting.titleNl, setting.titleEn, locale));

  if (!entries) {
    return { name, entries: [], today: null, openNow: false, note: openingHoursNote(setting, locale), unavailable: true };
  }

  const today = entryForDate(entries, now, locale);
  return {
    name,
    entries: entries.map((entry) => ({
      day: locale === "en" ? entry.dayEn : entry.dayNl,
      hours: entry.hours,
    })),
    today: today ? { day: locale === "en" ? today.dayEn : today.dayNl, hours: today.hours } : null,
    openNow: Boolean(today && !isClosedHours(today.hours) && isOpenAt(today.hours, now)),
    note: openingHoursNote(setting, locale),
    unavailable: false,
  };
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
