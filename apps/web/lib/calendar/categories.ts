import "server-only";

import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import type { CalendarCategoryOption } from "@/components/editorial/KalenderEditorialView";
import { siteBaseUrl } from "./feeds";

/**
 * De categorieën die de kalender kent, in beheerdersvolgorde. Gewone categorieën
 * volgen `showOnCalendarPage`; doelgroepen zijn altijd nodig voor hun eigen
 * filterchip, badge, categoriepagina en feed.
 */
export async function listCalendarCategories(): Promise<CalendarCategoryOption[]> {
  return prisma.calendarCategory.findMany({
    where: { OR: [{ showOnCalendarPage: true }, { audience: { not: null } }] },
    select: { slug: true, nameNl: true, nameEn: true, colour: true, audience: true },
    orderBy: [{ order: "asc" }, { nameNl: "asc" }],
  });
}

/**
 * De hoofdfeed zonder selectie. Absoluut, want hij belandt in een `webcal:`-link
 * en in het klembord voor Google Calendar; een relatief pad doet daar niets.
 *
 * De abonneerdialoog hangt er zelf `c`- en `algemeen`-parameters aan (zie
 * `feedScopeFromQuery`), dus er is maar één basis-URL nodig.
 */
export function feedBaseUrlFor(locale: Locale): string {
  return `${siteBaseUrl()}/api/calendar/feed.ics${locale === "en" ? "?lang=en" : ""}`;
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
    audienceFilters: nl ? "Doelgroepen" : "Target audiences",
    onlyMyAudiences: nl ? "Afstemmen op mijn profiel" : "Tailor to my profile",
    onlyMyAudiencesHint: nl
      ? "Toon algemene evenementen en enkel doelgroepactiviteiten die passen bij je profiel."
      : "Show general events and only target-audience events that match your profile.",
    views: {
      agenda: nl ? "Agenda" : "Agenda",
      week: nl ? "Week" : "Week",
      list: nl ? "Lijst" : "List",
    },
  };
}
