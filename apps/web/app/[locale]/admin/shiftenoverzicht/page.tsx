import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { buildOverview } from "@/lib/praesidiumShifts/overview";
import { yearsWithData } from "@/lib/praesidiumShifts/server";
import { OverviewHeader } from "./OverviewHeader";
import { MemberTable } from "./MemberTable";
import { UploadListForm } from "./UploadListForm";
import { ListCards, TodoCard, listTodos } from "./OverviewBlocks";
import { overviewErrorMessages } from "./messages";

const sectionLink = "text-sm font-medium text-vtk-ink underline decoration-vtk-navy/25 underline-offset-4 hover:decoration-vtk-ink";

export default async function PraesidiumShiftOverview({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("shift.praesidium");

  const { jaar } = await searchParams;
  const year = parseWorkingYear(jaar);
  const [overview, years, aliasCount] = await Promise.all([
    buildOverview(year, locale),
    yearsWithData(),
    prisma.praesidiumShiftAlias.count(),
  ]);
  const confirmed = overview.eventLists.filter((l) => l.status === "ACTIVE");
  // De nieuwste lijst eerst: die is het meest van tel.
  const newestFirst = [...overview.eventLists].reverse();

  return (
    <div className="space-y-7">
      <OverviewHeader
        nl={nl}
        active="lijsten"
        year={year}
        years={workingYearTabs(years)}
        subtitle={
          nl
            ? "Wie van het praesidium hoeveel shiften opnam, op de shiftenlijsten van de grote evenementen en op /shift."
            : "How many shifts each praesidium member took, on the shift lists of the big events and on /shift."
        }
      />

      {overview.roster.length === 0 && (
        <p className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-4 text-sm text-vtk-body shadow-[inset_3px_0_0_var(--color-vtk-yellow)]">
          {nl
            ? "Er staat dit werkingsjaar nog niemand in een praesidiumpost. Het overzicht telt enkel wie in /admin/groepen op een post staat; vul die eerst aan."
            : "Nobody holds a praesidium post this working year yet. The overview only counts who is on a post in /admin/groepen; fill that in first."}{" "}
          <Link href={`${base}/admin/groepen?jaar=${year}`} className="font-medium underline">
            {nl ? "Naar de posten" : "To the posts"}
          </Link>
        </p>
      )}

      <TodoCard items={listTodos(overview.eventLists, base, nl)} nl={nl} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{nl ? "Evenementen" : "Events"}</h2>
          <Link href={`${base}/admin/shiftenoverzicht/bijnamen?jaar=${year}`} className={sectionLink}>
            {nl ? `Bijnamen (${aliasCount})` : `Nicknames (${aliasCount})`}
          </Link>
        </div>
        <ListCards
          lists={newestFirst}
          base={base}
          nl={nl}
          upload={<UploadListForm locale={locale} kind="EVENT" year={year} errorMessages={overviewErrorMessages(locale)} variant="card" />}
        />
      </section>

      {overview.roster.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{nl ? "Per praesidiumlid" : "Per praesidium member"}</h2>
            <Link href={`${base}/admin/shiftenoverzicht/siteshiften?jaar=${year}`} className={sectionLink}>
              {nl ? "Shiften op /shift aanduiden" : "Mark shifts on /shift"}
            </Link>
          </div>
          <MemberTable
            locale={locale}
            members={overview.members}
            averages={overview.averages}
            lists={confirmed}
            errorMessages={overviewErrorMessages(locale)}
          />
        </section>
      )}
    </div>
  );
}
