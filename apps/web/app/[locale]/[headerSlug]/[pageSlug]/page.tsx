import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { contentPageMetadata } from "@/lib/pageMetadata";
import { loadHeaderTab, loadPageBySlug } from "@/lib/pageQueries";
import { pagePath } from "@/lib/sitemap";
import { PageView } from "@/components/site/PageView";

type Params = Promise<{ locale: string; headerSlug: string; pageSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, headerSlug, pageSlug } = await params;
  if (!hasLocale(locale)) return {};

  const [tab, page] = await Promise.all([loadHeaderTab(headerSlug), loadPageBySlug(pageSlug)]);
  if (!tab || !page || page.headerTabId !== tab.id || !page.publishedAt) return {};

  return contentPageMetadata(page, locale, pagePath({ slug: page.slug, headerTabSlug: tab.slug }));
}

export default async function HeaderPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam, headerSlug, pageSlug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);

  const tab = await loadHeaderTab(headerSlug);
  if (!tab) notFound();

  const page = await loadPageBySlug(pageSlug);

  if (!page || page.headerTabId !== tab.id || !page.publishedAt) notFound();

  return (
    <PageView
      page={page}
      locale={locale}
      downloadsLabel={dict.pages.downloads}
      onThisPageLabel={dict.pages.onThisPage}
      searchParams={searchParams}
      pagePath={`${locale === "en" ? "/en" : ""}/${tab.slug}/${page.slug}`}
    />
  );
}
