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

  const intro = pick(tab.introNl ?? "", tab.introEn ?? "", locale);
  const ctaLabel = pick(tab.ctaLabelNl ?? "", tab.ctaLabelEn ?? "", locale);
  // Intro en knop komen uit de categorie zelf, beheerd via /admin/inhoud.
  const showCta = Boolean(ctaLabel && tab.ctaUrl);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · {dict.pages.overview}</div>
          <h1 className="vtk-page-title">{pick(tab.labelNl, tab.labelEn, locale)}</h1>
          {intro && <p className="vtk-page-subtitle">{intro}</p>}
        </div>
        {showCta && (
          <div>
            <a href={tab.ctaUrl!} className="vtk-button vtk-button-primary arrow">
              {ctaLabel}
            </a>
          </div>
        )}
      </header>

      <div className="vtk-page-shell">
        {tab.pages.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{dict.pages.empty}</p>
        ) : (
          <ul className="vtk-card-grid">
            {tab.pages.map((page) => (
              <li key={page.id}>
                <Link href={`${base}/${tab.slug}/${page.slug}`}>
                  <Card className="vtk-card h-full">
                    <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
                      {pick(page.titleNl, page.titleEn, locale)}
                    </h2>
                    {(page.excerptNl || page.excerptEn) && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#34405e]">
                        {pick(page.excerptNl ?? "", page.excerptEn ?? "", locale)}
                      </p>
                    )}
                    <span className="mt-4 inline-block text-sm font-medium text-vtk-ink">
                      {dict.home.readMore} →
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
