import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { IconLink } from "@/components/ui/IconButton";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { hasLocale } from "@/lib/locale";
import { attendanceYears, canViewAttendance, loadAttendance } from "@/lib/bo/attendance/server";
import { attendanceBase, dayLabel, Legend, pct, resolveYear, StackBar, withYear, YearPicker } from "../parts";

/** Elke BO van het jaar met een gelezen verslag, met de opkomst. */
export default async function AttendanceMeetingsPage({
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
  const { meetings, averageRate } = await loadAttendance(year, nl);

  return (
    <div className="ticket-admin-page bo-att">
      <YearPicker years={years} year={year} href={`${base}/vergaderingen`} nl={nl} />
      {meetings.length === 0 ? (
        <p className="ticket-admin-help">
          {nl ? "Nog geen verslagen gelezen voor dit werkingsjaar." : "No minutes read for this working year yet."}
        </p>
      ) : (
        <section className="ticket-admin-section" aria-labelledby="att-meetings">
          <div className="ticket-admin-section-head">
            <div>
              <h2 id="att-meetings">{nl ? `${meetings.length} vergaderingen` : `${meetings.length} meetings`}</h2>
              <p>
                {nl
                  ? `Opkomst is aanwezig op wie ingekleurd was; gemiddeld ${pct(averageRate)}. Het verschil staat in procentpunten.`
                  : `Turnout is present out of everyone coloured in; ${pct(averageRate)} on average. The difference is in percentage points.`}
              </p>
            </div>
          </div>
          <Legend nl={nl} />
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table">
              <thead>
                <tr>
                  <th scope="col">BO</th>
                  <th scope="col">{nl ? "Datum" : "Date"}</th>
                  <th scope="col">{nl ? "Aanwezig" : "Present"}</th>
                  <th scope="col">{nl ? "Verontsch." : "Excused"}</th>
                  <th scope="col">{nl ? "Afwezig" : "Absent"}</th>
                  <th scope="col">{nl ? "Opkomst" : "Turnout"}</th>
                  <th scope="col">{nl ? "T.o.v. gemiddeld" : "Vs average"}</th>
                  <th scope="col">
                    <span className="sr-only">{nl ? "Verslag" : "Minutes"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => {
                  const href = withYear(`${base}/vergaderingen/${m.id}`, year);
                  const diff = m.rate !== null && averageRate !== null ? Math.round((m.rate - averageRate) * 100) : null;
                  return (
                    <LinkedRow key={m.id} href={href} className="ticket-admin-linked-row">
                      <td>
                        <Link href={href}>
                          <strong>{m.label}</strong>
                        </Link>
                      </td>
                      <td className="tabular-nums">{dayLabel(m.date, nl)}</td>
                      <td className="tabular-nums">{m.present}</td>
                      <td className="tabular-nums">{m.excused}</td>
                      <td className="tabular-nums">{m.absent}</td>
                      <td>
                        <span className="bo-att-rate">
                          <StackBar counts={m} nl={nl} />
                          <span className="bo-att-rate-num">{pct(m.rate)}</span>
                        </span>
                      </td>
                      <td className="tabular-nums">{diff === null ? "–" : diff > 0 ? `+${diff}` : String(diff)}</td>
                      <td data-row-action>
                        {m.minutesUrl && (
                          <IconLink
                            href={m.minutesUrl}
                            target="_blank"
                            rel="noreferrer"
                            label={nl ? "Verslag openen in Drive" : "Open minutes in Drive"}
                            srLabel={nl ? `Verslag openen: ${m.label}` : `Open minutes: ${m.label}`}
                          >
                            <ExternalLinkIcon />
                          </IconLink>
                        )}
                      </td>
                    </LinkedRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
