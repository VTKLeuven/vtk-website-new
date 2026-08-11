import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { formatEuro } from "@/lib/theokot";
import { MEETING_DEFAULTS, semesterToPlan, suggestedMeetingDays, type Semester } from "@/lib/meetings";
import { getMeetingDrinks } from "@/lib/meetings-server";
import { loadGrocomeetDebts, loadMeetingAdmin } from "@/lib/meetingAdmin";
import { MeetingAdminCard } from "@/components/meetings/MeetingAdminCard";
import { MeetingPlanner } from "@/components/meetings/MeetingPlanner";
import { MeetingDrinksCard } from "@/components/meetings/MeetingDrinksCard";
import { NewMeetingCard } from "@/components/meetings/NewMeetingCard";
import { SemesterTabs } from "@/components/meetings/SemesterTabs";

import "@/app/design/vtk-basic.css";

/**
 * Beheer van de grocomeets: de kalender van een semester, de vergaderingen zelf
 * met hun bestellingen, en wie nog wat verschuldigd is. Hoort bij Groep 5
 * (`grocomeet.manage`); het bureau van Onderwijs draait op dezelfde code onder
 * /admin/bureau.
 */
export default async function AdminGrocomeetPage({
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
  await requirePermission("grocomeet.manage");

  const { semester: semesterParam } = await searchParams;
  const workingYear = currentWorkingYear();
  const semester: Semester = semesterParam === "1" || semesterParam === "2" ? Number(semesterParam) as Semester : semesterToPlan();

  const [{ meetings, planned, hasPlan }, drinks, debts] = await Promise.all([
    loadMeetingAdmin("GROCOMEET", { locale, workingYear, semester }),
    getMeetingDrinks(),
    loadGrocomeetDebts(workingYear),
  ]);

  const openTotal = debts.reduce((total, row) => total + row.openCents, 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">
        Grocomeet · {formatWorkingYear(workingYear)}
      </h1>

      <SemesterTabs nl={nl} base={`${nl ? "" : "/en"}/admin/grocomeet`} semester={semester} />

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">
          {nl ? `Kalender semester ${semester}` : `Calendar semester ${semester}`}
        </h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {hasPlan
            ? nl
              ? "Duid aan op welke dagen er een grocomeet is. Dagen waarvoor al besteld is, kan je hier niet weghalen."
              : "Mark the days with a grocomeet. Days that already have orders cannot be removed here."
            : nl
              ? "De kalender van dit semester staat nog niet vast. Duid aan op welke dagen er een grocomeet is; het voorstel hieronder volgt het gewone ritme."
              : "This semester's calendar is not set yet. Mark the days with a grocomeet; the suggestion below follows the usual rhythm."}
        </p>
        <MeetingPlanner
          nl={nl}
          kind="GROCOMEET"
          year={workingYear}
          semester={semester}
          planned={planned}
          suggested={suggestedMeetingDays(workingYear, semester, "GROCOMEET")}
          defaultTime={MEETING_DEFAULTS.GROCOMEET.time}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Openstaand" : "Outstanding"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? `Per persoon over ${formatWorkingYear(workingYear)}. Afvinken doe je bij de vergadering zelf, zodat je ziet welke bestelling betaald werd.`
            : `Per person over ${formatWorkingYear(workingYear)}. Tick off at the meeting itself, so you can see which order was paid.`}
        </p>
        {debts.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Nog geen bestellingen." : "No orders yet."}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  <th className="py-1 pr-3">{nl ? "Naam" : "Name"}</th>
                  <th className="py-1 pr-3 text-right">{nl ? "Bestellingen" : "Orders"}</th>
                  <th className="py-1 pr-3 text-right">{nl ? "Totaal" : "Total"}</th>
                  <th className="py-1 pr-3 text-right">{nl ? "Betaald" : "Paid"}</th>
                  <th className="py-1 text-right">{nl ? "Openstaand" : "Outstanding"}</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((row) => (
                  <tr key={row.userId} className="border-t border-vtk-blue/10">
                    <td className="py-1.5 pr-3">{row.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{row.orders}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(row.totalCents)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">
                      {formatEuro(row.paidCents)}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {formatEuro(row.openCents)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-vtk-blue/20">
                  <td className="py-1.5 pr-3 font-semibold" colSpan={4}>
                    {nl ? "Totaal openstaand" : "Total outstanding"}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{formatEuro(openTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewMeetingCard nl={nl} kind="GROCOMEET" year={workingYear} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{nl ? "Vergaderingen" : "Meetings"}</h2>
        {meetings.length === 0 ? (
          <div className="vtk-basic-empty">
            {nl ? "Nog geen grocomeets in dit semester." : "No grocomeets in this semester yet."}
          </div>
        ) : (
          meetings.map((meeting) => <MeetingAdminCard key={meeting.id} nl={nl} meeting={meeting} />)
        )}
      </div>

      <MeetingDrinksCard nl={nl} kind="GROCOMEET" items={drinks.items} priceCents={drinks.priceCents} />
    </div>
  );
}
