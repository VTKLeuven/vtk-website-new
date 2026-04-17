import { KalenderEditorialView } from "@/components/editorial/KalenderEditorialView";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { notFound } from "next/navigation";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-kalender.css";

function editorialLabels(locale: Locale) {
  const nl = locale === "nl";
  return {
    crumbsHome: nl ? "Home" : "Home",
    crumbsHere: nl ? "Kalender" : "Calendar",
    metaEvents: nl ? "Evenementen (deze maand)" : "Events (this month)",
    metaCategories: nl ? "Categorieën" : "Categories",
    metaExport: nl ? "Export" : "Export",
    weekLine: nl ? "// raster" : "// grid",
    legendTitle: nl ? "Legenda" : "Legend",
    legendSub: nl ? "// op basis van groep" : "// by group",
    agendaNext: nl ? "Eerstvolgend" : "Up next",
    agendaSub: nl ? "// komende 14 dagen" : "// next 14 days",
    subscribeTitle: nl ? "Abonneren" : "Subscribe",
    subscribeSub: nl ? "// voeg toe aan agenda" : "// add to your calendar",
    ical: "iCal",
    google: "Google Calendar",
    outlook: "Outlook",
    prevEvents: nl ? "Vorige maand" : "Previous month",
    nextMonth: nl ? "Volgende maand" : "Next month",
    chips: {
      all: nl ? "Alle" : "All",
      gala: "Gala",
      career: "Career",
      cantus: "Cantus",
      service: nl ? "Service" : "Service",
    },
    views: {
      agenda: nl ? "Agenda" : "Agenda",
      month: nl ? "Maand" : "Month",
      list: nl ? "Lijst" : "List",
    },
  };
}

export default async function KalenderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  return (
    <div className="vtk-design">
      <KalenderEditorialView locale={locale} labels={editorialLabels(locale)} />
    </div>
  );
}
