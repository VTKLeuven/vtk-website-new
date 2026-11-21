import { notFound } from "next/navigation";
import { CalendarX2, CircleCheck, CircleHelp, Percent } from "lucide-react";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { attendanceYears, canViewAttendance, loadAttendance } from "@/lib/bo/attendance/server";
import { changesSince, personSlug, type PersonStats } from "@/lib/bo/attendance/stats";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { attendanceBase, dayLabel, pct, resolveYear, STATUS_LETTER, statusLabel, withYear } from "../../parts";

/** Eén BO: wie er was, wie niet, en wat er veranderde tegenover de vorige. */
export default async function AttendanceMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(locale)) notFound();
  if (!(await canViewAttendance())) notFound();
  const nl = locale === "nl";
  const base = attendanceBase(nl);
  const years = await attendanceYears();
  const year = resolveYear((await searchParams).jaar, years);
  const data = await loadAttendance(year, nl);
  const index = data.meetings.findIndex((m) => m.id === id);
  if (index < 0) notFound();
  const meeting = data.meetings[index];
  const previous = index > 0 ? data.meetings[index - 1] : null;
  const next = data.meetings[index + 1] ?? null;
  const byKey = new Map(data.people.map((p) => [p.key, p]));
  const changes = changesSince(data.meetings, data.people, index);
  const total = meeting.present + meeting.excused + meeting.absent;
  const diff =
    meeting.rate !== null && data.averageRate !== null ? Math.round((meeting.rate - data.averageRate) * 100) : null;

  const personLink = (p: PersonStats) => (
    <Link href={withYear(`${base}/personen/${personSlug(p.key)}`, year)}>{p.name}</Link>
  );

  return (
    <div className="ticket-admin-page bo-att">
      <div className="bo-att-pager">
        <Link href={withYear(`${base}/vergaderingen`, year)} className="ticket-admin-back">
          {nl ? "← Alle vergaderingen" : "← All meetings"}
        </Link>
        <span>
          {previous && <Link href={withYear(`${base}/vergaderingen/${previous.id}`, year)}>{`‹ ${previous.label}`}</Link>}
          {next && <Link href={withYear(`${base}/vergaderingen/${next.id}`, year)}>{`${next.label} ›`}</Link>}
        </span>
      </div>

      <div className="ticket-admin-section-head">
        <div>
          <h2>
            {meeting.label}, {dayLabel(meeting.date, nl)}
          </h2>
          <p>
            {meeting.title ?? ""}
            {meeting.minutesUrl && (
              <>
                {meeting.title ? " · " : ""}
                <a href={meeting.minutesUrl} target="_blank" rel="noreferrer">
                  {nl ? "Verslag in Drive" : "Minutes in Drive"}
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="ticket-admin-metrics">
        <AdminMetric
          icon={Percent}
          label={nl ? "Opkomst" : "Turnout"}
          value={pct(meeting.rate)}
          detail={
            diff === null
              ? undefined
              : nl
                ? `${diff > 0 ? "+" : ""}${diff} procentpunt t.o.v. gemiddeld`
                : `${diff > 0 ? "+" : ""}${diff} points vs average`
          }
        />
        <AdminMetric
          icon={CircleCheck}
          label={nl ? "Aanwezig" : "Present"}
          value={String(meeting.present)}
          detail={nl ? `van ${total}` : `of ${total}`}
          tone="success"
        />
        <AdminMetric icon={CircleHelp} label={nl ? "Verontschuldigd" : "Excused"} value={String(meeting.excused)} />
        <AdminMetric icon={CalendarX2} label={nl ? "Afwezig" : "Absent"} value={String(meeting.absent)} />
      </div>

      {changes && previous && (changes.dropped.length > 0 || changes.returned.length > 0) && (
        <section className="ticket-admin-section" aria-labelledby="att-changes">
          <h3 id="att-changes">{nl ? `Tegenover ${previous.label}` : `Compared with ${previous.label}`}</h3>
          <dl className="bo-att-facts">
            <div>
              <dt>{nl ? "Er niet meer bij" : "No longer there"}</dt>
              <dd>
                {changes.dropped.length
                  ? changes.dropped.map((p, i) => (
                      <span key={p.key}>
                        {i > 0 && ", "}
                        {personLink(p)}
                      </span>
                    ))
                  : "–"}
              </dd>
            </div>
            <div>
              <dt>{nl ? "Terug" : "Back"}</dt>
              <dd>
                {changes.returned.length
                  ? changes.returned.map((p, i) => (
                      <span key={p.key}>
                        {i > 0 && ", "}
                        {personLink(p)}
                      </span>
                    ))
                  : "–"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="ticket-admin-section" aria-labelledby="att-names">
        <h3 id="att-names">{nl ? "Wie er was" : "Who was there"}</h3>
        <div className="bo-att-columns">
          {(["PRESENT", "EXCUSED", "ABSENT", "UNKNOWN"] as const).map((status) => {
            const people = meeting.people[status].map((key) => byKey.get(key)!).filter(Boolean);
            if (status === "UNKNOWN" && people.length === 0) return null;
            return (
              <div key={status} className="bo-att-column" data-status={status.toLowerCase()}>
                <h4>
                  <span className="bo-att-cell" data-status={status.toLowerCase()} aria-hidden="true">
                    {STATUS_LETTER[status]}
                  </span>
                  {statusLabel(status, nl)} <span className="bo-att-count">{people.length}</span>
                </h4>
                <ul>
                  {people
                    .sort((a, b) => a.name.localeCompare(b.name, "nl"))
                    .map((p) => (
                      <li key={p.key}>
                        {personLink(p)}
                        {p.posts.length > 0 && <small className="bo-att-sub">{p.posts.join(", ")}</small>}
                        {!p.userId && <small className="bo-att-sub">{nl ? "niet gekoppeld" : "not linked"}</small>}
                      </li>
                    ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
