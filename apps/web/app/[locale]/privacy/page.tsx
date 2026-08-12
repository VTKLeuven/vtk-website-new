import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { LegalArticle } from "@/components/site/LegalArticle";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("privacy", "/privacy", locale);
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const t = dict.privacy;

  return (
    <LegalArticle
      kicker={t.kicker}
      title={t.title}
      lead={t.lead}
      updated={t.updated}
      sections={t.sections}
    />
  );
}
