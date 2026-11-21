import { notFound } from "next/navigation";
import { CalendarX2, CircleCheck, CircleHelp, Percent } from "lucide-react";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { attendanceYears, canViewAttendance, loadAttendance } from "@/lib/bo/attendance/server";
import { rankOf, rateOf, RECENT_MEETINGS } from "@/lib/bo/attendance/stats";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { attendanceBase, dayLabel, pct, RateBar, resolveYear, StatusCell, statusLabel, withYear } from "../../parts";

function meetingsText(n: number, nl: boolean): string {
  return nl ? `${n} ${n === 1 ? "BO" : "BO's"}` : `${n} ${n === 1 ? "meeting" : "meetings"}`;
}

/** Eén persoon: de cijfers, hoe die zich verhouden tot het praesidium, per maand en per BO. */
export default async function AttendancePersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; key: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale, key: rawKey } = await params;
  if (!hasLocale(locale)) notFound();
  if (!(await canViewAttendance())) notFound();
  const nl = locale === "nl";
  const base = attendanceBase(nl);
  const years = await attendanceYears();
  const year = resolveYear((await searchParams).jaar, years);
  const data = await loadAttendance(year, nl);
  const key = decodeURIComponent(rawKey);
  const person = data.people.find((p) => p.key === key);
  if (!person) notFound();

  const { meetings, averageRate } = data;
  const rank = rankOf(data.people, person.key);
  const listedAt = person.cells.map((cell, i) => (cell === null ? -1 : i)).filter((i) => i >= 0);
  const first = listedAt.length ? meetings[listedAt[0]] : null;
  const lastMissed = person.lastMissed !== null ? meetings[person.lastMissed] : null;

  // Per maand: de persoon tegenover het praesidium in dezelfde BO's.
  const monthFormat = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const months = new Map<string, { label: string; meetings: number; present: number; excused: number; absent: number; board: number[] }>();
  meetings.forEach((m, i) => {
    const cell = person.cells[i];
    if (!m.date || cell === null) return;
    const id = m.date.toISOString().slice(0, 7);
    const month = months.get(id) ?? { label: monthFormat.format(m.date), meetings: 0, present: 0, excused: 0, absent: 0, board: [] };
    month.meetings += 1;
    if (cell === "PRESENT") month.present += 1;
    if (cell === "EXCUSED") month.excused += 1;
    if (cell === "ABSENT") month.absent += 1;
    if (m.rate !== null) month.board.push(m.rate);
    months.set(id, month);
  });

  const facts: Array<{ label: string; value: string }> = [
    {
      label: nl ? "Rangschikking" : "Ranking",
      value: rank ? (nl ? `${rank.rank}e van ${rank.of}` : `${rank.rank} of ${rank.of}`) : "–",
    },
    {
      label: nl ? `Laatste ${RECENT_MEETINGS} BO's` : `Last ${RECENT_MEETINGS} meetings`,
      value: person.recentRate === null ? (nl ? "nog geen vijf" : "fewer than five") : pct(person.recentRate),
    },
    {
      label: nl ? "Aanwezig of verontschuldigd" : "Present or excused",
      value: pct(person.reportedRate),
    },
    {
      label: nl ? "Langste reeks aanwezig" : "Longest run present",
      value: meetingsText(person.longestPresentStreak, nl),
    },
    {
      label: nl ? "Langste reeks onverwittigd weg" : "Longest run absent without excuse",
      value: meetingsText(person.longestAbsentStreak, nl),
    },
    {
      label: nl ? "Laatst gemist" : "Last missed",
      value: lastMissed ? `${lastMissed.label}, ${dayLabel(lastMissed.date, nl)}` : nl ? "nog nooit" : "never",
    },
    {
      label: nl ? "In de verslagen sinds" : "In the minutes since",
      value: first ? `${first.label}, ${dayLabel(first.date, nl)}` : "–",
    },
  ];

  return (
    <div className="ticket-admin-page bo-att">
      <Link href={withYear(`${base}/personen`, year)} className="ticket-admin-back">
        {nl ? "← Alle personen" : "← All people"}
      </Link>

      <div className="ticket-admin-section-head">
        <div>
          <h2>{person.name}</h2>
          <p>
            {person.posts.length
              ? person.posts.join(", ")
              : nl
                ? "Niet gekoppeld aan iemand van het praesidium van dit jaar: zo staat de naam in het verslag."
                : "Not linked to anyone on this year's board: this is how the name appears in the minutes."}
          </p>
        </div>
      </div>

      <div className="ticket-admin-metrics">
        <AdminMetric
          icon={Percent}
          label={nl ? "Aanwezigheid" : "Attendance"}
          value={pct(person.rate)}
          detail={nl ? `gemiddeld per BO ${pct(averageRate)}` : `average per meeting ${pct(averageRate)}`}
          tone={person.rate !== null && averageRate !== null && person.rate < averageRate - 0.15 ? "warning" : "default"}
        />
        <AdminMetric
          icon={CircleCheck}
          label={nl ? "Aanwezig" : "Present"}
          value={String(person.present)}
          detail={nl ? `van ${person.listed} ${person.listed === 1 ? "verslag" : "verslagen"}` : `of ${person.listed} minutes`}
          tone="success"
        />
        <AdminMetric icon={CircleHelp} label={nl ? "Verontschuldigd" : "Excused"} value={String(person.excused)} />
        <AdminMetric
          icon={CalendarX2}
          label={nl ? "Afwezig" : "Absent"}
          value={String(person.absent)}
          detail={
            person.absentStreak >= 2
              ? nl
                ? `de laatste ${person.absentStreak} na elkaar`
                : `the last ${person.absentStreak} in a row`
              : undefined
          }
          tone={person.absent >= 3 || person.absentStreak >= 2 ? "danger" : "default"}
        />
      </div>

      <section className="ticket-admin-section" aria-labelledby="att-person-facts">
        <h3 id="att-person-facts" className="sr-only">
          {nl ? "Kerncijfers" : "Key figures"}
        </h3>
        <dl className="bo-att-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {months.size > 1 && (
        <section className="ticket-admin-section" aria-labelledby="att-person-months">
          <div className="ticket-admin-section-head">
            <div>
              <h3 id="att-person-months">{nl ? "Per maand" : "Per month"}</h3>
              <p>
                {nl
                  ? "Het streepje is de opkomst van het hele praesidium op dezelfde BO's."
                  : "The tick is the turnout of the whole board at the same meetings."}
              </p>
            </div>
          </div>
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table" data-compact>
              <thead>
                <tr>
                  <th scope="col">{nl ? "Maand" : "Month"}</th>
                  <th scope="col">{nl ? "BO's" : "Meetings"}</th>
                  <th scope="col">{nl ? "Aanwezig" : "Attended"}</th>
                  <th scope="col">{nl ? "Verontschuldigd" : "Excused"}</th>
                  <th scope="col">{nl ? "Afwezig" : "Absent"}</th>
                </tr>
              </thead>
              <tbody>
                {[...months.entries()].map(([id, m]) => (
                  <tr key={id}>
                    <td>{m.label}</td>
                    <td className="tabular-nums">{m.meetings}</td>
                    <td>
                      <RateBar
                        rate={rateOf(m)}
                        average={m.board.length ? m.board.reduce((a, b) => a + b, 0) / m.board.length : null}
                      />
                    </td>
                    <td className="tabular-nums">{m.excused}</td>
                    <td className="tabular-nums">{m.absent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="ticket-admin-section" aria-labelledby="att-person-meetings">
        <h3 id="att-person-meetings">{nl ? "Per BO" : "Per meeting"}</h3>
        <div className="ticket-admin-table-wrap">
          <table className="ticket-admin-table" data-compact>
            <thead>
              <tr>
                <th scope="col">BO</th>
                <th scope="col">{nl ? "Datum" : "Date"}</th>
                <th scope="col">{nl ? "Status" : "Status"}</th>
                <th scope="col">{nl ? "Opkomst die BO" : "Turnout that meeting"}</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m, i) => {
                const cell = person.cells[i];
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={withYear(`${base}/vergaderingen/${m.id}`, year)}>
                        <strong>{m.label}</strong>
                      </Link>
                    </td>
                    <td className="tabular-nums">{dayLabel(m.date, nl)}</td>
                    <td>
                      <span className="bo-att-status">
                        <StatusCell cell={cell} nl={nl} />
                        <span aria-hidden="true">
                          {cell === null ? (nl ? "Niet in het verslag" : "Not in the minutes") : statusLabel(cell, nl)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <RateBar rate={m.rate} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
