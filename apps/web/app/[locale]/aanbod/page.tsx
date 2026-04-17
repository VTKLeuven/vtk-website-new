import { AanbodEditorial } from "@/components/editorial/AanbodEditorial";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { notFound } from "next/navigation";

export default async function AanbodPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  return <AanbodEditorial locale={locale} />;
}
