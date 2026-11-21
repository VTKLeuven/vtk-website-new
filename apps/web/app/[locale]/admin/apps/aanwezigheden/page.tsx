import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarCheck, Percent } from "lucide-react";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { attendanceYears, canViewAttendance, loadAttendance } from "@/lib/bo/attendance/server";
import { personSlug } from "@/lib/bo/attendance/stats";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { attendanceBase, dayLabel, Legend, minutesErrorText, pct, RateBar, resolveYear, withYear, YearPicker } from "./parts";

/**
 * Het overzicht: hoe druk elke BO bezet was, per post, wie opvolging nodig
 * heeft, en wat er aan de verslagen zelf schort.
 */
export default async function AttendanceOverviewPage({
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
  const { meetings, averageRate } = data;

  const rated = meetings.filter((m) => m.rate !== null);
  const best = rated.reduce<(typeof rated)[number] | null>((a, m) => (!a || m.rate! > a.rate! ? m : a), null);
  const worst = rated.reduce<(typeof rated)[number] | null>((a, m) => (!a || m.rate! < a.rate! ? m : a), null);
  const always = data.people.filter((p) => p.userId && p.rate === 1 && p.present >= 3);

  // Wat aan de verslagen zelf schort: een BO zonder verslag, een verslag dat
  // niet te lezen was, of een naam die niet in het praesidium staat.
  // Een BO die nog moet komen, heeft nog geen verslag.
  const problems = data.files.filter(
    (f) => f.kind !== "WRITTEN" && (!f.minutes ? !f.upcoming : Boolean(f.minutes.error) || f.minutes.missing),
  );

  return (
    <div className="ticket-admin-page bo-att">
      <YearPicker years={years} year={year} href={base} nl={nl} />

      {meetings.length === 0 ? (
        <section className="ticket-admin-section">
          <h2>{nl ? "Nog geen verslagen gelezen" : "No minutes read yet"}</h2>
          <p className="ticket-admin-help">
            {nl
              ? "De scan van de BO-map zoekt in elke vergadering naar een Google Doc of Word-bestand met \"verslag\" in de naam, en daarin naar de kop \"Aanwezigheden\" met de namen in groen, oranje of rood. Staan de verslagen er, dan verschijnen ze na de volgende scan (om het halfuur, of met \"Nu lezen\")."
              : "The board folder scan looks in every meeting for a Google Doc or Word file with \"verslag\" in its name, and in it for the heading \"Aanwezigheden\" with the names in green, orange or red. Once the minutes are there, they appear after the next scan (every half hour, or with \"Read now\")."}
          </p>
        </section>
      ) : (
        <>
          <div className="ticket-admin-metrics">
            <AdminMetric
              icon={Percent}
              label={nl ? "Gemiddelde aanwezigheid" : "Average attendance"}
              value={pct(averageRate)}
              detail={nl ? "aanwezig op wie ingekleurd was" : "present out of everyone coloured in"}
            />
            <AdminMetric
              icon={CalendarCheck}
              label={nl ? "Verslagen gelezen" : "Minutes read"}
              value={String(meetings.length)}
              detail={nl ? `${data.people.filter((p) => p.userId).length} praesidiumleden` : `${data.people.filter((p) => p.userId).length} board members`}
            />
            <AdminMetric
              icon={ArrowUpRight}
              label={nl ? "Hoogste opkomst" : "Highest turnout"}
              value={best ? pct(best.rate) : "–"}
              detail={best ? `${best.label}, ${dayLabel(best.date, nl)}` : undefined}
              tone="success"
            />
            <AdminMetric
              icon={ArrowDownRight}
              label={nl ? "Laagste opkomst" : "Lowest turnout"}
              value={worst ? pct(worst.rate) : "–"}
              detail={worst ? `${worst.label}, ${dayLabel(worst.date, nl)}` : undefined}
              tone={worst && averageRate !== null && worst.rate! < averageRate - 0.15 ? "warning" : "default"}
            />
          </div>

          <section className="ticket-admin-section" aria-labelledby="att-trend">
            <div className="ticket-admin-section-head">
              <div>
                <h2 id="att-trend">{nl ? "Per vergadering" : "Per meeting"}</h2>
                <p>
                  {nl
                    ? "Elke kolom is een BO: onderaan wie er was, daarboven wie zich verontschuldigde en wie wegbleef. De lijn is het gemiddelde. De cijfers staan bij Vergaderingen."
                    : "Each column is a meeting: present at the bottom, then excused and absent. The line is the average. The numbers are under Meetings."}
                </p>
              </div>
            </div>
            <div className="bo-att-chart">
              {averageRate !== null && (
                <span className="bo-att-chart-avg" style={{ bottom: `${averageRate * 100}%` }} aria-hidden="true" />
              )}
              {meetings.map((m) => {
                const total = m.present + m.excused + m.absent;
                const h = (n: number) => `${total ? (n / total) * 100 : 0}%`;
                return (
                  <Link
                    key={m.id}
                    href={withYear(`${base}/vergaderingen/${m.id}`, year)}
                    className="bo-att-chart-col"
                    aria-label={
                      nl
                        ? `${m.label}, ${dayLabel(m.date, nl)}: ${m.present} aanwezig, ${m.excused} verontschuldigd, ${m.absent} afwezig (${pct(m.rate)})`
                        : `${m.label}, ${dayLabel(m.date, nl)}: ${m.present} present, ${m.excused} excused, ${m.absent} absent (${pct(m.rate)})`
                    }
                    title={`${m.label}: ${pct(m.rate)}`}
                  >
                    <span className="bo-att-chart-bar" aria-hidden="true">
                      <span data-status="absent" style={{ height: h(m.absent) }} />
                      <span data-status="excused" style={{ height: h(m.excused) }} />
                      <span data-status="present" style={{ height: h(m.present) }} />
                    </span>
                    <span className="bo-att-chart-label" aria-hidden="true">
                      {m.label.replace(/^(BO|Begrotings-BO|Budget meeting) /, "")}
                    </span>
                  </Link>
                );
              })}
            </div>
            <Legend nl={nl} />
          </section>

          {data.followUp.length > 0 && (
            <section className="ticket-admin-section" aria-labelledby="att-follow">
              <div className="ticket-admin-section-head">
                <div>
                  <h2 id="att-follow">{nl ? "Op te volgen" : "To follow up"}</h2>
                  <p>
                    {nl
                      ? "Drie keer of meer afwezig zonder verontschuldiging, of de laatste twee BO's na elkaar."
                      : "Absent without excuse three times or more, or at the last two meetings in a row."}
                  </p>
                </div>
              </div>
              <ul className="bo-att-people">
                {data.followUp.map((p) => (
                  <li key={p.key}>
                    <Link href={withYear(`${base}/personen/${personSlug(p.key)}`, year)}>{p.name}</Link>
                    <span>{p.posts.join(", ")}</span>
                    <span>
                      {nl
                        ? `${p.absent}× onverwittigd afwezig${p.absentStreak >= 2 ? `, de laatste ${p.absentStreak} na elkaar` : ""}`
                        : `${p.absent}× absent without excuse${p.absentStreak >= 2 ? `, the last ${p.absentStreak} in a row` : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.posts.length > 0 && (
            <section className="ticket-admin-section" aria-labelledby="att-posts">
              <div className="ticket-admin-section-head">
                <div>
                  <h2 id="att-posts">{nl ? "Per post" : "Per post"}</h2>
                  <p>
                    {nl
                      ? "Alle BO's van alle leden van de post samen. Het streepje is het gemiddelde van het praesidium."
                      : "All meetings of all members of the post together. The tick is the board average."}
                  </p>
                </div>
              </div>
              <div className="ticket-admin-table-wrap">
                <table className="ticket-admin-table" data-compact>
                  <thead>
                    <tr>
                      <th scope="col">{nl ? "Post" : "Post"}</th>
                      <th scope="col">{nl ? "Leden" : "Members"}</th>
                      <th scope="col">{nl ? "Aanwezigheid" : "Attendance"}</th>
                      <th scope="col">{nl ? "Onverwittigd afwezig" : "Absent without excuse"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.posts.map((post) => (
                      <tr key={post.post}>
                        <td>
                          <strong>{post.post}</strong>
                        </td>
                        <td className="tabular-nums">{post.members}</td>
                        <td>
                          <RateBar rate={post.rate} average={averageRate} />
                        </td>
                        <td className="tabular-nums">{post.absent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {always.length > 0 && (
            <section className="ticket-admin-section" aria-labelledby="att-always">
              <h2 id="att-always">{nl ? "Altijd aanwezig" : "Never missed one"}</h2>
              <p className="ticket-admin-help">
                {always
                  .map((p) => p.name)
                  .join(", ")}
              </p>
            </section>
          )}
        </>
      )}

      {(problems.length > 0 || data.unmatched.length > 0) && (
        <section className="ticket-admin-section" aria-labelledby="att-check">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon">
                <AlertTriangle aria-hidden="true" size={17} />
              </span>
              <div>
                <h2 id="att-check">{nl ? "Na te kijken" : "To check"}</h2>
                <p>
                  {nl
                    ? "Wat hier staat, telt niet of niet juist mee. De site schrijft niets in Drive: pas het verslag daar aan, en de volgende scan neemt het over."
                    : "What is listed here does not count, or not correctly. The site writes nothing to Drive: fix the minutes there and the next scan picks it up."}
                </p>
              </div>
            </div>
          </div>
          <ul className="bo-att-checks">
            {problems.map((f) => (
              <li key={f.id}>
                <a href={f.minutes?.url ?? f.folderUrl} target="_blank" rel="noreferrer">
                  {f.label}
                </a>
                <span>
                  {!f.minutes
                    ? nl
                      ? "Geen verslag gevonden in de map (een Google Doc of Word-bestand met \"verslag\" in de naam)."
                      : "No minutes found in the folder (a Google Doc or Word file with \"verslag\" in its name)."
                    : f.minutes.missing
                      ? nl
                        ? "Het verslag staat niet meer in de map; de laatst gelezen aanwezigheden blijven tellen."
                        : "The minutes are no longer in the folder; the last attendance read still counts."
                      : minutesErrorText(f.minutes.error!, nl)}
                </span>
              </li>
            ))}
            {data.unmatched.map((p) => (
              <li key={p.key}>
                <Link href={withYear(`${base}/personen/${personSlug(p.key)}`, year)}>{p.name}</Link>
                <span>
                  {nl
                    ? `Niet gekoppeld aan iemand van het praesidium van dit jaar (in ${p.listed} ${p.listed === 1 ? "verslag" : "verslagen"}). Een tikfout in het verslag, of geen post meer.`
                    : `Not linked to anyone on this year's board (in ${p.listed} ${p.listed === 1 ? "set of minutes" : "sets of minutes"}). A typo in the minutes, or no longer on a post.`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
