import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import { KalenderEditorialView } from "@/components/editorial/KalenderEditorialView";
import { calendarLabels, feedBaseUrlFor, listCalendarCategories } from "@/lib/calendar/categories";
import { viewerPrefersOwnAudiences } from "@/lib/calendar/audience";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { notFound } from "next/navigation";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-kalender.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("kalender", "/kalender", locale);
}

export default async function KalenderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  const [categories, prefersOwnAudiences] = await Promise.all([
    listCalendarCategories(),
    viewerPrefersOwnAudiences(),
  ]);

  return (
    <div className="vtk-design">
      <KalenderEditorialView
        locale={locale}
        labels={calendarLabels(locale)}
        categories={categories}
        feedBaseUrl={feedBaseUrlFor(locale)}
        defaultOnlyMyAudiences={prefersOwnAudiences}
      />
    </div>
  );
}
