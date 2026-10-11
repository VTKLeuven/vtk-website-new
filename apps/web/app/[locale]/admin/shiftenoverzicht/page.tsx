import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import Link from "@/components/ui/Link";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { buildOverview } from "@/lib/praesidiumShifts/overview";
import { yearsWithData } from "@/lib/praesidiumShifts/server";
import { formatCount } from "@/lib/praesidiumShifts/stats";
import { OverviewHeader } from "./OverviewHeader";
import { MemberTable } from "./MemberTable";
import { UploadListForm } from "./UploadListForm";
import { overviewErrorMessages } from "./messages";
import { ListStatus } from "./ListStatus";

function formatDay(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
  const drafts = overview.eventLists.filter((l) => l.status === "DRAFT");
  const open = confirmed.filter((l) => l.unresolvedNames > 0);

  return (
    <div className="space-y-8">
      <OverviewHeader
        nl={nl}
        active="lijsten"
        year={year}
        years={workingYearTabs(years)}
        subtitle={
          nl
            ? "Wie van het praesidium hoeveel shiften opnam: op de shiftenlijsten van de grote evenementen en op /shift. Laad een export van een Google Sheet op; namen en bijnamen worden onthouden voor de volgende lijst."
            : "How many shifts each praesidium member took: on the shift lists of the big events and on /shift. Upload an export of a Google Sheet; names and nicknames are remembered for the next list."
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

      {(drafts.length > 0 || open.length > 0) && (
        <ul className="space-y-2">
          {[...drafts, ...open].map((list) => (
            <li
              key={list.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated px-4 py-3 text-sm shadow-[inset_3px_0_0_var(--color-vtk-yellow)]"
            >
              <span>
                <strong className="font-semibold">{list.name}</strong>{" "}
                {list.status === "DRAFT"
                  ? nl
                    ? "is opgeladen maar nog niet bevestigd; ze telt nog niet mee."
                    : "is uploaded but not confirmed yet; it does not count yet."
                  : nl
                    ? `heeft ${list.unresolvedNames} ${list.unresolvedNames === 1 ? "naam" : "namen"} zonder keuze; ${formatCount(list.unresolvedShifts, locale)} ${list.unresolvedShifts === 1 ? "shift telt" : "shiften tellen"} daardoor nog voor niemand.`
                    : `has ${list.unresolvedNames} names without a choice; ${formatCount(list.unresolvedShifts, locale)} shifts count for nobody yet.`}
              </span>
              <Link
                href={`${base}/admin/shiftenoverzicht/lijst/${list.id}`}
                className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-medium hover:bg-vtk-blue-soft/60"
              >
                {list.status === "DRAFT" ? (nl ? "Nakijken" : "Review") : nl ? "Namen kiezen" : "Choose names"}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{nl ? "Per praesidiumlid" : "Per praesidium member"}</h2>
          <Link
            href={`${base}/admin/shiftenoverzicht/siteshiften?jaar=${year}`}
            className="text-sm font-medium text-vtk-ink underline-offset-4 hover:underline"
          >
            {nl ? "Shiften op /shift aanduiden als noodzakelijk" : "Mark shifts on /shift as necessary"}
          </Link>
        </div>
        {overview.roster.length > 0 && (
          <MemberTable locale={locale} members={overview.members} averages={overview.averages} lists={confirmed} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{nl ? "Shiftenlijsten" : "Shift lists"}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`${base}/admin/shiftenoverzicht/bijnamen?jaar=${year}`}
              className="text-sm font-medium text-vtk-ink underline-offset-4 hover:underline"
            >
              {nl ? `Bijnamen (${aliasCount})` : `Nicknames (${aliasCount})`}
            </Link>
            <UploadListForm locale={locale} kind="EVENT" year={year} errorMessages={overviewErrorMessages(locale)} />
          </div>
        </div>

        {overview.eventLists.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-vtk-blue/20 p-6 text-sm text-vtk-muted">
            {nl
              ? "Nog geen shiftenlijsten voor dit werkingsjaar. Laad de export van een Google Sheet op; de eerste tab met telefoonnummers wordt herkend en telt niet als shift."
              : "No shift lists for this working year yet. Upload the export of a Google Sheet; a first tab with phone numbers is recognised and does not count as a shift."}
          </p>
        ) : (
          <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
                <tr>
                  <th className="px-4 py-2.5">{nl ? "Lijst" : "List"}</th>
                  <th className="px-2 py-2.5">{nl ? "Datum" : "Date"}</th>
                  <th className="px-2 py-2.5 text-right!">{nl ? "VTK-shiften" : "VTK shifts"}</th>
                  <th className="px-2 py-2.5 text-right!">{nl ? "Praesidium" : "Praesidium"}</th>
                  <th className="px-2 py-2.5 text-right!">{nl ? "Gem. per lid" : "Avg. per member"}</th>
                  <th className="px-2 py-2.5 text-right!">{nl ? "Richtlijn" : "Target"}</th>
                  <th className="px-2 py-2.5 text-right!">{nl ? "Nog open" : "Still open"}</th>
                  <th className="px-4 py-2.5">{nl ? "Status" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {[...overview.eventLists].reverse().map((list) => (
                  <LinkedRow
                    key={list.id}
                    href={`${base}/admin/shiftenoverzicht/lijst/${list.id}`}
                    className="cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30"
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`${base}/admin/shiftenoverzicht/lijst/${list.id}`} className="font-medium hover:underline">
                        {list.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-vtk-body">{formatDay(list.eventDate, locale)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatCount(list.counted, locale)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatCount(list.praesidium, locale)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatCount(list.average, locale)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {list.expectedPerMember !== null ? (
                        <>
                          {formatCount(list.expectedPerMember, locale)}
                          <span className="ml-1 text-xs text-vtk-muted">
                            ({list.metTarget}/{overview.roster.length})
                          </span>
                        </>
                      ) : (
                        <span className="text-vtk-muted">{nl ? "geen" : "none"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {list.openSlots !== null ? formatCount(list.openSlots, locale) : <span className="text-vtk-muted">?</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <ListStatus list={list} nl={nl} />
                    </td>
                  </LinkedRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
