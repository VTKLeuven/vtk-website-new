import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { attendanceYears, canViewAttendance, loadAttendance } from "@/lib/bo/attendance/server";
import { personSlug } from "@/lib/bo/attendance/stats";
import { attendanceBase, Legend, resolveYear, withYear, YearPicker } from "../parts";
import { PeopleTable, type PersonRow } from "./PeopleTable";

/** Iedereen uit de verslagen van het jaar, met per BO een vakje. */
export default async function AttendancePeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  if (!(await canViewAttendance())) notFound();
  const nl = locale === "nl";
  const base = attendanceBase(nl);
  const years = await attendanceYears();
  const year = resolveYear((await searchParams).jaar, years);
  const data = await loadAttendance(year, nl);

  const rows: PersonRow[] = data.people.map((p) => ({
    key: p.key,
    href: withYear(`${base}/personen/${personSlug(p.key)}`, year),
    name: p.name,
    posts: p.posts,
    linked: p.userId !== null,
    present: p.present,
    excused: p.excused,
    absent: p.absent,
    rate: p.rate,
    recentRate: p.recentRate,
    presentStreak: p.presentStreak,
    absentStreak: p.absentStreak,
    cells: p.cells,
  }));

  return (
    <div className="ticket-admin-page bo-att">
      <YearPicker years={years} year={year} href={`${base}/personen`} nl={nl} />
      {rows.length === 0 ? (
        <p className="ticket-admin-help">
          {nl ? "Nog geen verslagen gelezen voor dit werkingsjaar." : "No minutes read for this working year yet."}
        </p>
      ) : (
        <section className="ticket-admin-section" aria-labelledby="att-people">
          <div className="ticket-admin-section-head">
            <div>
              <h2 id="att-people">{nl ? `${rows.length} personen` : `${rows.length} people`}</h2>
              <p>
                {nl
                  ? "Aanwezig is het deel van de BO's waarop iemand ingekleurd stond. Het streepje in de balk is het gemiddelde van alle BO's. Reeks: hoeveel BO's na elkaar er of weg (zonder verontschuldiging), tot de laatste."
                  : "Attended is the share of meetings where someone was coloured in. The tick in the bar is the average over all meetings. Streak: how many meetings in a row present or away (without excuse), up to the last one."}
              </p>
            </div>
          </div>
          <Legend nl={nl} />
          <PeopleTable rows={rows} meetings={data.meetings.map((m) => m.label)} average={data.averageRate} nl={nl} />
        </section>
      )}
    </div>
  );
}
