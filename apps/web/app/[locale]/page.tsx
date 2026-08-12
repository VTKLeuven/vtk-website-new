import { HomeEditorial } from "@/components/editorial/HomeEditorial";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import type { Locale } from "@vtk/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("home", "/", locale);
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  // De aankondiging staat niet meer hier maar in de layout (`SiteAnnouncement`),
  // zodat ze ook op andere pagina's kan verschijnen. Beheer via
  // /admin/aankondigingen, inclusief de keuze homepage of hele site.
  return <HomeEditorial locale={locale} />;
}
