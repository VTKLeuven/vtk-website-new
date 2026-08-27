import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { contentPageMetadata } from "@/lib/pageMetadata";
import { loadPageBySlug } from "@/lib/pageQueries";
import { pagePath } from "@/lib/sitemap";
import { PageView } from "@/components/site/PageView";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(locale)) return {};

  const page = await loadPageBySlug(slug);
  if (!page || !page.publishedAt) return {};

  // Een pagina onder een categorie is ook bereikbaar via /p/<slug>, maar de
  // categorievorm is de canonieke: dat is de weg die de navigatie aanbiedt.
  return contentPageMetadata(
    page,
    locale,
    pagePath({ slug: page.slug, headerTabSlug: page.headerTab?.slug ?? null }),
  );
}

export default async function UnlistedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);

  const page = await loadPageBySlug(slug);

  if (!page || !page.publishedAt) notFound();

  return (
    <PageView
      // Deze route toont de pagina los van haar categorie; de kruimel hoort bij
      // de /<categorie>/<pagina>-vorm.
      page={{ ...page, headerTab: null }}
      locale={locale}
      downloadsLabel={dict.pages.downloads}
      onThisPageLabel={dict.pages.onThisPage}
      searchParams={searchParams}
      pagePath={`${locale === "en" ? "/en" : ""}/p/${page.slug}`}
    />
  );
}
