import type { Stats } from "@/lib/bo/dossiers";
import { SECTIONS } from "@/lib/bo/explorer";
import type { Summary, SummaryRow } from "@/lib/bo/summary";

/*
 * "Resultaten per post": het overzicht onderaan /admin/bestuursorgaan, gemaakt
 * om er elke week een schermafbeelding van op een slide te zetten. Daarom één
 * kader dat alles draagt (titel, datum, totalen, alle posten) en in de kolom
 * van 900 px op één scherm past: de vakken staan in twee kolommen. De kleuren
 * zijn die van het rekenblad waarmee Groep 5 dit vroeger bijhield: rood onder
 * 50%, oranje onder 100%, groen wanneer alles binnen is.
 */

export function tone(pct: number | null): "down" | "low" | "ok" | undefined {
  if (pct === null) return undefined;
  if (pct >= 1) return "ok";
  return pct >= 0.5 ? "low" : "down";
}

const pctText = (pct: number | null) => (pct === null ? "–" : `${Math.round(pct * 100)}%`);

/** Een kolomkop, met een korte vorm voor een smal scherm (`vtk-admin.css`). */
function Head({ long, short }: { long: string; short: string }) {
  return (
    <th scope="col" className="num" title={long}>
      <span className="long">{long}</span>
      <span className="short" aria-hidden="true">
        {short}
      </span>
    </th>
  );
}

export function BoSummary({ summary, year, nl }: { summary: Summary; year: string; nl: boolean }) {
  const today = new Date().toLocaleDateString(nl ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });
  const kpi = (label: string, s: Stats) => (
    <div className="vtk-bo-sum-kpi">
      <span className="l">{label}</span>
      <span className="v">
        <b>{s.due}</b> {s.due === 1 ? "budget" : nl ? "budgetten" : "budgets"}
        <span aria-hidden="true"> · </span>
        <b>{s.done}</b> {nl ? (s.done === 1 ? "resultaat" : "resultaten") : s.done === 1 ? "result" : "results"}
      </span>
      <span className="vtk-bo-sum-pct" data-tone={tone(s.pct)}>
        {pctText(s.pct)}
      </span>
    </div>
  );
  const line = (r: SummaryRow) => (
    <tr key={r.key} data-empty={r.due === 0 || undefined}>
      <th scope="row">{r.name}</th>
      <td className="num">{r.due}</td>
      <td className="num">{r.done}</td>
      <td className="num">{r.due ? r.missing : ""}</td>
      <td className="pct">
        {r.due === 0 ? (
          <span className="none" title={nl ? "Nog geen budget gepasseerd" : "No budget passed yet"}>
            –
          </span>
        ) : (
          <span className="vtk-bo-sum-pct" data-tone={tone(r.pct)}>
            {pctText(r.pct)}
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <section className="vtk-bo-sum" aria-labelledby="bo-sum-title">
      <div className="vtk-bo-sum-head">
        <h2 id="bo-sum-title">{nl ? `Resultaten per post ${year}` : `Results per post ${year}`}</h2>
        <p>
          {nl ? "Stand op" : "As of"} {today}
          {summary.lastMeeting && (nl ? `, na ${summary.lastMeeting}` : `, after ${summary.lastMeeting}`)}
        </p>
      </div>
      <div className="vtk-bo-sum-kpis">
        {kpi(nl ? "Totaal" : "Total", summary.total)}
        {kpi("VTK", summary.vtk)}
        {kpi(nl ? "Werkgroepen" : "Working groups", summary.werkgroepen)}
      </div>
      <div className="vtk-bo-sum-cols">
        {summary.sections.map(({ section, rows }) => {
          const label = SECTIONS.find(([key]) => key === section)?.[nl ? 1 : 2] ?? section;
          return (
            <table key={section} className="vtk-bo-sum-table">
              <caption>{label}</caption>
              <thead>
                <tr>
                  <th scope="col">Post</th>
                  <Head long={nl ? "Budgetten" : "Budgets"} short={nl ? "Budg." : "Budg."} />
                  <Head long={nl ? "Resultaten" : "Results"} short={nl ? "Res." : "Res."} />
                  <Head long={nl ? "Missend" : "Missing"} short={nl ? "Mis." : "Miss."} />
                  <th scope="col" className="pct">%</th>
                </tr>
              </thead>
              <tbody>{rows.map(line)}</tbody>
            </table>
          );
        })}
      </div>
      <p className="vtk-bo-sum-foot">
        {nl
          ? "Budgetten: op een BO die al plaatsvond, of schriftelijk goedgekeurd. Percentage: daarvan met een resultaat. Rood onder 50%, oranje onder 100%, groen wanneer alles binnen is; een streepje: nog geen budget gepasseerd."
          : "Budgets: at a meeting that already took place, or approved in writing. Percentage: of those, with a result. Red below 50%, orange below 100%, green when everything is in; a dash: no budget passed yet."}
      </p>
    </section>
  );
}
