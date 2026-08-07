import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { KalenderEditorialView } from "@/components/editorial/KalenderEditorialView";
import { Markdown } from "@/components/ui/Markdown";
import { calendarLabels, feedUrlFor, listCalendarCategories } from "@/lib/calendar/categories";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-kalender.css";

type Category = {
  slug: string;
  nameNl: string;
  nameEn: string;
  descriptionNl: string | null;
  descriptionEn: string | null;
};

/** De categorie achter een slug, of null als die slug geen categorie is. */
export function findCategoryBySlug(slug: string): Promise<Category | null> {
  return prisma.calendarCategory.findUnique({
    where: { slug },
    select: { slug: true, nameNl: true, nameEn: true, descriptionNl: true, descriptionEn: true },
  });
}

/**
 * Een categoriepagina is dezelfde kalender als /kalender, vastgezet op één
 * doelgroep: zelfde raster, zelfde legende, maar met een eigen titel, eigen
 * introtekst en vooral een eigen abonneerlink.
 */
export async function CategoryCalendar({
  category,
  locale,
}: {
  category: Category;
  locale: Locale;
}) {
  const base = locale === "nl" ? "" : "/en";
  const categories = await listCalendarCategories();
  const name = pick(category.nameNl, category.nameEn, locale);
  const description = pick(category.descriptionNl ?? "", category.descriptionEn ?? "", locale);

  const labels = calendarLabels(locale);

  return (
    <div className="vtk-design">
      <KalenderEditorialView
        locale={locale}
        labels={{ ...labels, crumbsHere: name }}
        categories={categories}
        feedUrl={feedUrlFor(locale, category.slug)}
        lockedCategory={category.slug}
        heading={name}
        parentCrumb={{ label: locale === "nl" ? "Kalender" : "Calendar", href: `${base}/kalender` }}
        intro={
          description ? (
            <div className="prose-vtk">
              <Markdown>{description}</Markdown>
            </div>
          ) : null
        }
      />
    </div>
  );
}
