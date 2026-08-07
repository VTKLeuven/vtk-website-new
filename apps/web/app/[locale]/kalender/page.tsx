import { KalenderEditorialView } from "@/components/editorial/KalenderEditorialView";
import { calendarLabels, feedUrlFor, listCalendarCategories } from "@/lib/calendar/categories";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { notFound } from "next/navigation";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-kalender.css";

export default async function KalenderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  const categories = await listCalendarCategories();

  return (
    <div className="vtk-design">
      <KalenderEditorialView
        locale={locale}
        labels={calendarLabels(locale)}
        categories={categories}
        feedUrl={feedUrlFor(locale)}
      />
    </div>
  );
}
