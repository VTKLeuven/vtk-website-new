import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { formatEuro } from "@/lib/theokot";
import { MEETING_DEFAULTS, semesterToPlan, suggestedMeetingDays, type Semester } from "@/lib/meetings";
import { getMeetingDrinks } from "@/lib/meetings-server";
import { loadBureauTotals, loadMeetingAdmin } from "@/lib/meetingAdmin";
import { MeetingAdminCard } from "@/components/meetings/MeetingAdminCard";
import { MeetingPlanner } from "@/components/meetings/MeetingPlanner";
import { MeetingDrinksCard } from "@/components/meetings/MeetingDrinksCard";
import { NewMeetingCard } from "@/components/meetings/NewMeetingCard";
import { SemesterTabs } from "@/components/meetings/SemesterTabs";

import "@/app/design/vtk-basic.css";

/**
 * Beheer van de VTK Bureaus: de kalender, de bureaus zelf met hun bestellingen
 * en opmerkingen, en de totalen voor de boekhouding. Hoort bij Onderwijs
 * (`bureau.manage`).
 */
export default async function AdminBureauPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ semester?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("bureau.manage");

  const { semester: semesterParam } = await searchParams;
  const workingYear = currentWorkingYear();
  const semester: Semester =
    semesterParam === "1" || semesterParam === "2" ? (Number(semesterParam) as Semester) : semesterToPlan();

  const [{ meetings, planned, hasPlan }, drinks, totals] = await Promise.all([
    loadMeetingAdmin("BUREAU", { locale, workingYear, semester }),
    getMeetingDrinks(),
    loadBureauTotals(workingYear, locale),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">VTK Bureau · {formatWorkingYear(workingYear)}</h1>

      <SemesterTabs nl={nl} base={`${nl ? "" : "/en"}/admin/bureau`} semester={semester} />

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">
          {nl ? `Kalender semester ${semester}` : `Calendar semester ${semester}`}
        </h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {hasPlan
            ? nl
              ? "Duid aan op welke dagen er een bureau is. Dagen waarvoor al besteld is, kan je hier niet weghalen."
              : "Mark the days with a bureau. Days that already have orders cannot be removed here."
            : nl
              ? "De kalender van dit semester staat nog niet vast. Duid aan wanneer de bureaus doorgaan; het voorstel volgt het ritme van om de twee weken."
              : "This semester's calendar is not set yet. Mark when the bureaus take place; the suggestion follows the two-weekly rhythm."}
        </p>
        <MeetingPlanner
          nl={nl}
          kind="BUREAU"
          year={workingYear}
          semester={semester}
          planned={planned}
          suggested={suggestedMeetingDays(workingYear, semester, "BUREAU")}
          defaultTime={MEETING_DEFAULTS.BUREAU.time}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Totalen" : "Totals"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Wat de broodjes en drankjes van de bureaus kosten. Studenten betalen niets; dit is voor de boekhouding van de post."
            : "What the sandwiches and drinks of the bureaus cost. Students pay nothing; this is for the post's bookkeeping."}
        </p>
        {totals.perMeeting.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Nog geen bestellingen." : "No orders yet."}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  <th className="py-1 pr-3">{nl ? "Bureau" : "Bureau"}</th>
                  <th className="py-1 pr-3 text-right">{nl ? "Bestellingen" : "Orders"}</th>
                  <th className="py-1 text-right">{nl ? "Bedrag" : "Amount"}</th>
                </tr>
              </thead>
              <tbody>
                {totals.perMeeting.map((row) => (
                  <tr key={row.id} className="border-t border-vtk-blue/10">
                    <td className="py-1.5 pr-3 capitalize">{row.dateLabel}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{row.orders}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatEuro(row.totalCents)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-vtk-blue/20">
                  <td className="py-1.5 pr-3 font-semibold" colSpan={2}>
                    {nl ? `Totaal ${formatWorkingYear(workingYear)}` : `Total ${formatWorkingYear(workingYear)}`}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {formatEuro(totals.yearCents)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-[#5c667f]" colSpan={2}>
                    {nl ? "Totaal over alle bureaus" : "Total across all bureaus"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-[#5c667f]">
                    {formatEuro(totals.allTimeCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewMeetingCard nl={nl} kind="BUREAU" year={workingYear} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{nl ? "Bureaus" : "Bureaus"}</h2>
        {meetings.length === 0 ? (
          <div className="vtk-basic-empty">
            {nl ? "Nog geen bureaus in dit semester." : "No bureaus in this semester yet."}
          </div>
        ) : (
          meetings.map((meeting) => <MeetingAdminCard key={meeting.id} nl={nl} meeting={meeting} />)
        )}
      </div>

      <MeetingDrinksCard nl={nl} kind="BUREAU" items={drinks.items} priceCents={drinks.priceCents} />
    </div>
  );
}
