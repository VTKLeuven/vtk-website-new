import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";

export default async function HeaderOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; headerSlug: string }>;
}) {
  const { locale: localeParam, headerSlug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  const tab = await prisma.headerTab.findUnique({
    where: { slug: headerSlug },
    include: {
      pages: {
        where: { visibleInHeader: true, publishedAt: { not: null } },
        orderBy: [{ order: "asc" }, { titleNl: "asc" }],
      },
    },
  });

  if (!tab || !tab.visible) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-vtk-blue md:text-4xl">
        {pick(tab.labelNl, tab.labelEn, locale)}
      </h1>
      <p className="mb-8 text-zinc-500">{dict.pages.overview}</p>

      {tab.pages.length === 0 ? (
        <p className="text-sm text-zinc-500">{dict.pages.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tab.pages.map((page) => (
            <li key={page.id}>
              <Link href={`${base}/${tab.slug}/${page.slug}`}>
                <Card className="p-5 transition hover:border-vtk-blue/20 hover:shadow-md">
                  <h2 className="text-lg font-semibold text-vtk-blue">
                    {pick(page.titleNl, page.titleEn, locale)}
                  </h2>
                  {(page.excerptNl || page.excerptEn) && (
                    <p className="mt-2 line-clamp-3 text-sm text-zinc-600">
                      {pick(page.excerptNl ?? "", page.excerptEn ?? "", locale)}
                    </p>
                  )}
                  <span className="mt-3 inline-block text-sm text-vtk-blue">
                    {dict.home.readMore} →
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
