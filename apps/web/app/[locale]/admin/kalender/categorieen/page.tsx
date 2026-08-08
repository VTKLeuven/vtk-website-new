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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {nl ? "Kalendercategorieën" : "Calendar categories"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-vtk-blue-muted">
          {nl
            ? "Een categorie is de doelgroep van een evenement, los van de post die het organiseert. Elke categorie krijgt een eigen kalenderpagina en een eigen agenda-feed waarop leden zich kunnen abonneren."
            : "A category is an event's audience, separate from the group organising it. Each category gets its own calendar page and its own calendar feed that members can subscribe to."}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">{nl ? "Nieuwe categorie" : "New category"}</h2>
        <CategoryForm locale={locale} />
      </Card>

      <Card className="divide-y divide-vtk-blue/10 p-5">
        {categories.length === 0 ? (
          <p className="text-sm text-vtk-blue-muted">
            {nl ? "Nog geen categorieën." : "No categories yet."}
          </p>
        ) : (
          categories.map((c) => (
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
                  {c.audience ? (
                    <span className="rounded-full border border-vtk-blue/20 px-2 py-0.5 text-xs text-vtk-blue-muted">
                      {nl ? "doelgroep, geen filterknop" : "audience, not a filter button"}
                    </span>
                  ) : null}
                  <a
                    href={`/api/calendar/feed/c/${c.slug}`}
                    className="text-vtk-blue-muted hover:underline"
                  >
                    {nl ? "feed" : "feed"}
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
              <CategoryForm category={{ ...c, eventCount: c._count.events }} locale={locale} />
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
