import type { Locale } from "@vtk/i18n";
import { LESBEZOEK_STATUS_META, type LesbezoekStatusCode } from "@/lib/lesbezoeken";

/**
 * "Jouw aanvragen" op /lesbezoeken: wat iemand aanvroeg en waar het staat.
 *
 * Zonder dit overzicht was de groene toast na het indienen het laatste wat een
 * aanvrager zag tot er een mail van VTK Onderwijs kwam, en die komt pas na het
 * antwoord van de docent. Of een aanvraag goed aankwam en al bekeken was, kon
 * je enkel navragen.
 *
 * De statussen heten hier anders dan in het beheer: "Nieuw" en "Afgewezen door
 * ons" zijn woorden van Onderwijs, niet van wie aanvroeg. De kleur van de pil is
 * wel dezelfde (`LESBEZOEK_STATUS_META`), zodat beide kanten hetzelfde lezen.
 */

export type MyLesbezoek = {
  id: string;
  startsAt: Date;
  subject: string;
  course: string;
  audience: string;
  status: LesbezoekStatusCode;
  reviewNote: string | null;
  professorMailedAt: Date | null;
  createdAt: Date;
  organisation: { name: string };
};

export type MyRequestsCopy = {
  title: string;
  intro: string;
  colVisit: string;
  colClass: string;
  colWhen: string;
  colStatus: string;
  noUpcoming: string;
  past: string;
  at: string;
  submitted: string;
  reason: string;
  note: string;
  status: Record<LesbezoekStatusCode, string>;
  detail: Record<LesbezoekStatusCode | "ASKED_ON", string>;
};

/** Bij een weigering is de toelichting een reden; anders een opmerking erbij. */
const REASON_STATUSES: readonly LesbezoekStatusCode[] = ["DECLINED", "REJECTED", "CANCELLED"];

export function MyRequests({
  rows,
  now,
  locale,
  copy,
}: {
  rows: MyLesbezoek[];
  now: Date;
  locale: Locale;
  copy: MyRequestsCopy;
}) {
  // Wat nog komt eerst en in de volgorde van de agenda; wat voorbij is, staat
  // dichtgeklapt en het recentste eerst. Daar kijkt zelden nog iemand naar.
  const upcoming = rows
    .filter((row) => row.startsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = rows
    .filter((row) => row.startsAt < now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return (
    <section className="vtk-panel lb-mine" id="jouw-aanvragen" aria-labelledby="lb-mine-title">
      <div className="lb-mine-head">
        <h2 id="lb-mine-title">{copy.title}</h2>
        <p>{copy.intro}</p>
      </div>
      {upcoming.length > 0 ? (
        <RequestTable rows={upcoming} locale={locale} copy={copy} />
      ) : (
        <p className="lb-mine-empty">{copy.noUpcoming}</p>
      )}
      {past.length > 0 && (
        <details className="lb-mine-past">
          <summary>{copy.past.replace("{count}", String(past.length))}</summary>
          <RequestTable rows={past} past locale={locale} copy={copy} />
        </details>
      )}
    </section>
  );
}

function RequestTable({
  rows,
  past = false,
  locale,
  copy,
}: {
  rows: MyLesbezoek[];
  /** Voorbij: de uitleg ("er wordt iemand verwacht") klopt dan niet meer. */
  past?: boolean;
  locale: Locale;
  copy: MyRequestsCopy;
}) {
  const tag = locale === "nl" ? "nl-BE" : "en-GB";
  const dateFmt = new Intl.DateTimeFormat(tag, {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const shortDateFmt = new Intl.DateTimeFormat(tag, {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat(tag, {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="lb-mine-wrap">
      <table className="lb-mine-table">
        <thead>
          <tr>
            <th scope="col">{copy.colVisit}</th>
            <th scope="col">{copy.colClass}</th>
            <th scope="col">{copy.colWhen}</th>
            <th scope="col">{copy.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const detail = past
              ? ""
              : row.status === "ASKED" && row.professorMailedAt
                ? copy.detail.ASKED_ON.replace("{date}", shortDateFmt.format(row.professorMailedAt))
                : copy.detail[row.status];
            const note = row.reviewNote?.trim();
            return (
              <tr key={row.id}>
                {/* Eén kind per cel: op een telefoon is de cel een raster van
                    label en waarde, en elk los kind zou een eigen rij worden. */}
                <td data-label={copy.colVisit}>
                  <div>
                    <span className="lb-mine-main">{row.subject}</span>
                    <span className="lb-mine-sub">{row.organisation.name}</span>
                  </div>
                </td>
                <td data-label={copy.colClass}>
                  <div>
                    <span className="lb-mine-main">{row.course}</span>
                    <span className="lb-mine-sub">{row.audience}</span>
                  </div>
                </td>
                <td data-label={copy.colWhen} className="lb-mine-when">
                  <div>
                    <span className="lb-mine-main">{dateFmt.format(row.startsAt)}</span>
                    <span className="lb-mine-sub">
                      {copy.at.replace("{time}", timeFmt.format(row.startsAt))}
                    </span>
                  </div>
                </td>
                <td data-label={copy.colStatus}>
                  <div className="lb-mine-status">
                    <span className="lb-badge" data-tone={LESBEZOEK_STATUS_META[row.status].tone}>
                      {copy.status[row.status]}
                    </span>
                    {detail && <p className="lb-mine-detail">{detail}</p>}
                    {note && (
                      <p className="lb-mine-detail">
                        <span className="lb-mine-label">
                          {REASON_STATUSES.includes(row.status) ? copy.reason : copy.note}:
                        </span>{" "}
                        {note}
                      </p>
                    )}
                    <p className="lb-mine-sub">
                      {copy.submitted.replace("{date}", shortDateFmt.format(row.createdAt))}
                    </p>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
