import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { PageView } from "@/components/site/PageView";

export default async function UnlistedPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);

  const page = await prisma.page.findUnique({
    where: { slug },
    include: { assets: { orderBy: { order: "asc" } } },
  });

  if (!page || !page.publishedAt) notFound();

  return <PageView page={page} locale={locale} downloadsLabel={dict.pages.downloads} />;
}
