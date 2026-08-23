import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { deleteCalendarCategoryAction } from "@/app/actions/calendar";
import { CategoryForm } from "./CategoryForm";

export default async function AdminCalendarCategories({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

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
  const ordinaryCategories = categories.filter((category) => category.audience === null);
  const audienceCategories = categories.filter((category) => category.audience !== null);

  function categoryRows(
    rows: typeof categories,
    kind: "category" | "audience",
    emptyLabel: string,
  ) {
    if (rows.length === 0) {
      return <p className="text-sm text-vtk-blue-muted">{emptyLabel}</p>;
    }
    return rows.map((c) => (
      <div key={c.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span
              aria-hidden
              className="inline-block size-3 rounded-full"
              style={{ background: c.colour }}
            />
            <Link href={`${base}/kalender/${c.slug}`} className="font-medium hover:underline">
              {nl ? c.nameNl : c.nameEn}
            </Link>
            <span className="text-vtk-blue-muted">
              {c._count.events} {nl ? "evenementen" : "events"}
            </span>
            <a
              href={`/api/calendar/feed/c/${c.slug}`}
              className="text-vtk-blue-muted hover:underline"
            >
              feed
            </a>
          </div>
          <DeleteIconButton
            label={nl ? "Verwijderen" : "Delete"}
            srLabel={`${nl ? "Verwijderen" : "Delete"}: ${nl ? c.nameNl : c.nameEn}`}
            action={deleteCalendarCategoryAction}
            fields={{ id: c.id }}
            title={nl ? "Categorie verwijderen?" : "Delete category?"}
            description={
              nl
                ? `De categorie "${c.nameNl}" verdwijnt, samen met haar kalenderpagina /kalender/${c.slug} en haar agenda-feed; wie daarop geabonneerd is, krijgt geen updates meer. De ${c._count.events} evenementen zelf blijven bestaan en blijven op /kalender staan, ze verliezen enkel deze categorie.`
                : `The category "${c.nameEn}" disappears, along with its calendar page /kalender/${c.slug} and its calendar feed; anyone subscribed to it stops receiving updates. The ${c._count.events} events themselves remain and stay on /kalender, they only lose this category.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Categorie verwijderd" : "Category deleted"}
          />
        </div>
        <CategoryForm
          category={{ ...c, eventCount: c._count.events }}
          locale={locale}
          kind={kind}
        />
      </div>
    ));
  }

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

      <Card className="divide-y divide-vtk-blue/10 p-5">
        {categoryRows(
          ordinaryCategories,
          "category",
          nl ? "Nog geen gewone categorieën." : "No ordinary categories yet.",
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">{nl ? "Doelgroepen" : "Target audiences"}</h2>
        <p className="mb-4 mt-1 text-sm text-vtk-blue-muted">
          {nl
            ? "Doelgroepen beschrijven voor wie een evenement bedoeld is, bijvoorbeeld Eerstejaars, Internationals en Laatstejaars. Ze verschijnen niet als filter: passende evenementen worden automatisch getoond."
            : "Target audiences describe who an event is intended for, for example First years, Internationals and Last years. They do not appear as filters: matching events are shown automatically."}
        </p>
        <h3 className="mb-3 font-medium">{nl ? "Nieuwe doelgroep" : "New target audience"}</h3>
        <CategoryForm locale={locale} kind="audience" />
      </Card>

      <Card className="divide-y divide-vtk-blue/10 p-5">
        {categoryRows(
          audienceCategories,
          "audience",
          nl ? "Nog geen doelgroepen." : "No target audiences yet.",
        )}
      </Card>
    </div>
  );
}
