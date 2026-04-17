import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { PageView } from "@/components/site/PageView";

export default async function HeaderPage({
  params,
}: {
  params: Promise<{ locale: string; headerSlug: string; pageSlug: string }>;
}) {
  const { locale: localeParam, headerSlug, pageSlug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);

  const tab = await prisma.headerTab.findUnique({ where: { slug: headerSlug } });
  if (!tab) notFound();

  const page = await prisma.page.findUnique({
    where: { slug: pageSlug },
    include: {
      assets: { orderBy: { order: "asc" } },
      headerTab: true,
    },
  });

  if (!page || page.headerTabId !== tab.id || !page.publishedAt) notFound();

  return <PageView page={page} locale={locale} downloadsLabel={dict.pages.downloads} />;
}
