import "server-only";

import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import type { CalendarCategoryOption } from "@/components/editorial/KalenderEditorialView";
import { siteBaseUrl } from "./feeds";

/**
 * De categorieën die de kalender kent, in beheerdersvolgorde. Doelgroepen zitten
 * er ook in: ze worden geen filterchip (dat filtert de weergave zelf op
 * `audience`), maar hun naam en kleur zijn nodig voor het label op een event.
 */
export async function listCalendarCategories(): Promise<CalendarCategoryOption[]> {
  return prisma.calendarCategory.findMany({
    where: { showOnCalendarPage: true },
    select: { slug: true, nameNl: true, nameEn: true, colour: true, audience: true },
    orderBy: [{ order: "asc" }, { nameNl: "asc" }],
  });
}

/**
 * De feed-URL die bij een weergave hoort. Absoluut, want hij belandt in een
 * `webcal:`-link en in de `cid`-parameter van Google Calendar; een relatief pad
 * doet daar niets.
 */
export function feedUrlFor(locale: Locale, categorySlug?: string): string {
  const path = categorySlug ? `/api/calendar/feed/c/${categorySlug}` : "/api/calendar/feed";
  return `${siteBaseUrl()}${path}${locale === "en" ? "?lang=en" : ""}`;
}

/** Labels van de kalenderweergave; gedeeld door /kalender en de categoriepagina's. */
export function calendarLabels(locale: Locale) {
  const nl = locale === "nl";
  return {
    crumbsHome: "Home",
    crumbsHere: nl ? "Kalender" : "Calendar",
    metaEvents: nl ? "Evenementen (deze maand)" : "Events (this month)",
    weekLine: nl ? "Raster" : "Grid",
    legendTitle: nl ? "Legende" : "Legend",
    legendSub: nl ? "Op basis van categorie" : "By category",
    agendaNext: nl ? "Eerstvolgend" : "Up next",
    agendaSub: nl ? "Komende 14 dagen" : "Next 14 days",
    emptyMonth: nl ? "Geen evenementen deze maand." : "No events this month.",
    emptyUpcoming: nl
      ? "Niets in de komende 14 dagen. Blader verder met de pijlen hierboven."
      : "Nothing in the next 14 days. Use the arrows above to look further ahead.",
    subscribeTitle: nl ? "Abonneren" : "Subscribe",
    subscribeSub: nl
      ? "Blijft vanzelf up-to-date in je agenda"
      : "Stays up to date in your calendar automatically",
    prevEvents: nl ? "Vorige maand" : "Previous month",
    nextMonth: nl ? "Volgende maand" : "Next month",
    all: nl ? "Alle" : "All",
    uncategorised: nl ? "Zonder categorie" : "Uncategorised",
    showAllAudiences: nl ? "Ook andere doelgroepen" : "Other audiences too",
    showAllAudiencesHint: nl
      ? "Toon ook evenementen die specifiek voor eerstejaars of internationals bedoeld zijn."
      : "Also show events aimed specifically at first years or international students.",
    // Twee weergaven, geen drie: het maandraster ís de agenda, en de lijst is
    // dezelfde maand chronologisch. De vroegere derde weergave toonde dezelfde
    // lijst als de tweede, enkel zonder legende.
    views: {
      agenda: nl ? "Agenda" : "Agenda",
      list: nl ? "Lijst" : "List",
    },
  };
}
