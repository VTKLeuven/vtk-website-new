import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { CategoryForm } from "./CategoryForm";
import { CategoryList } from "./CategoryList";

export default async function AdminCalendarCategories({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  // Categorieën gelden over alle posten heen, dus dit hoort bij wie alle
  // evenementen beheert; `calendar.create` (eigen post) is niet genoeg.
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.manageAll")) {
    return <p>{nl ? "Geen toegang." : "No access."}</p>;
  }

  const categories = await prisma.calendarCategory.findMany({
    orderBy: [{ order: "asc" }, { nameNl: "asc" }],
    include: { _count: { select: { events: true } } },
  });
  const ordinaryCategories = categories
    .filter((category) => category.audience === null)
    .map((c) => ({ ...c, eventCount: c._count.events }));
  const audienceCategories = categories
    .filter((category) => category.audience !== null)
    .map((c) => ({ ...c, eventCount: c._count.events }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {nl ? "Kalendercategorieën" : "Calendar categories"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-vtk-blue-muted">
          {nl
            ? "Beheer hier twee aparte indelingen voor evenementen: wat voor evenement het is en voor wie het bedoeld is. Elke indeling krijgt een eigen kalenderpagina en agenda-feed."
            : "Manage two separate ways of classifying events here: what kind of event it is and who it is intended for. Each classification gets its own calendar page and feed."}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">
          {nl ? "Gewone categorieën" : "Ordinary categories"}
        </h2>
        <p className="mb-4 mt-1 text-sm text-vtk-blue-muted">
          {nl
            ? "Categorieën beschrijven wat voor evenement het is, bijvoorbeeld Career, Feest en Ontspanning. Ze kunnen als filter op de kalender verschijnen."
            : "Categories describe what kind of event it is, for example Career, Party and Recreation. They can appear as filters on the calendar."}
        </p>
        <h3 className="mb-3 font-medium">{nl ? "Nieuwe categorie" : "New category"}</h3>
        <CategoryForm locale={locale} kind="category" />
      </Card>

      <Card className="p-0">
        <CategoryList
          categories={ordinaryCategories}
          locale={locale}
          kind="category"
          emptyLabel={nl ? "Nog geen gewone categorieën." : "No ordinary categories yet."}
        />
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">{nl ? "Doelgroepen" : "Target audiences"}</h2>
        <p className="mb-4 mt-1 text-sm text-vtk-blue-muted">
          {nl
            ? "Doelgroepen beschrijven voor wie een evenement bedoeld is, bijvoorbeeld Eerstejaars, Internationals, Laatstejaars en Alumni. Bezoekers kunnen erop filteren of de kalender op hun profiel afstemmen."
            : "Target audiences describe who an event is intended for, for example First years, Internationals, Last years and Alumni. Visitors can filter by them or tailor the calendar to their profile."}
        </p>
        <h3 className="mb-3 font-medium">{nl ? "Nieuwe doelgroep" : "New target audience"}</h3>
        <CategoryForm locale={locale} kind="audience" />
      </Card>

      <Card className="p-0">
        <CategoryList
          categories={audienceCategories}
          locale={locale}
          kind="audience"
          emptyLabel={nl ? "Nog geen doelgroepen." : "No target audiences yet."}
        />
      </Card>
    </div>
  );
}
