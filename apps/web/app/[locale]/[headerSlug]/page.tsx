import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { categoryTiles } from "@/lib/categoryTiles";
import { hasLocale } from "@/lib/locale";
import { loadHeaderTabWithPages } from "@/lib/pageQueries";
import { buildMetadata } from "@/lib/seo";

type Params = Promise<{ locale: string; headerSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, headerSlug } = await params;
  if (!hasLocale(locale)) return {};

  const tab = await loadHeaderTabWithPages(headerSlug);
  if (!tab || !tab.visible) return {};

  // De intro van de categorie is de beschrijving; zonder intro valt
  // `buildMetadata` terug op de sitebeschrijving.
  return buildMetadata({
    title: pick(tab.labelNl, tab.labelEn, locale),
    description: pick(tab.introNl ?? "", tab.introEn ?? "", locale),
    path: `/${tab.slug}`,
    locale,
  });
}

export default async function HeaderOverviewPage({ params }: { params: Params }) {
  const { locale: localeParam, headerSlug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  const tab = await loadHeaderTabWithPages(headerSlug);

  if (!tab || !tab.visible) notFound();

  const tiles = categoryTiles(tab);
  const intro = pick(tab.introNl ?? "", tab.introEn ?? "", locale);
  const ctaLabel = pick(tab.ctaLabelNl ?? "", tab.ctaLabelEn ?? "", locale);
  // Intro en knop komen uit de categorie zelf, beheerd via /admin/inhoud.
  const showCta = Boolean(ctaLabel && tab.ctaUrl);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
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
        {tiles.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{dict.pages.empty}</p>
        ) : (
          <ul className="vtk-card-grid">
            {tiles.map((tile) => {
              const excerpt = pick(tile.excerptNl ?? "", tile.excerptEn ?? "", locale);
              const card = (
                <Card className="vtk-card h-full">
                  <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
                    {pick(tile.labelNl, tile.labelEn, locale)}
                  </h2>
                  {excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#34405e]">{excerpt}</p>
                  )}
                  <span className="mt-4 inline-block text-sm font-medium text-vtk-ink">
                    {dict.home.readMore} →
                  </span>
                </Card>
              );
              return (
                <li key={tile.key}>
                  {tile.external ? (
                    // Een andere site opent in een nieuw tabblad, net als in het
                    // uitklapmenu van de header.
                    <a href={tile.href} target="_blank" rel="noopener noreferrer">
                      {card}
                    </a>
                  ) : (
                    <Link href={`${base}${tile.href}`}>{card}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
