import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { CalendarView } from "./CalendarView";

export default async function KalenderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const groups = await prisma.group.findMany({
    orderBy: { orderInPraesidium: "asc" },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-6">{dict.calendar.title}</h1>
      <CalendarView
        locale={locale}
        groups={groups.map((g) => ({
          code: g.code,
          nameNl: g.nameNl,
          nameEn: g.nameEn,
        }))}
        labels={{
          filters: dict.calendar.filters,
          selectAll: dict.calendar.selectAll,
          deselectAll: dict.calendar.deselectAll,
        }}
      />
    </div>
  );
}
