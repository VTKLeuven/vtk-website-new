import { Fragment } from "react";
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

/**
 * Een bedrag tegenover de begroting, in hele euro: "+€ 1.234" of "−€ 320". Het
 * teken blijft met een woordverbinder aan het bedrag, zodat het niet alleen op
 * een regel belandt.
 */
function begrotingText(cents: number, nl: boolean): string {
  const euros = Math.round(cents / 100);
  const amount = `€ ${Math.abs(euros).toLocaleString(nl ? "nl-BE" : "en-GB")}`;
  return euros > 0 ? `+\u2060${amount}` : euros < 0 ? `−\u2060${amount}` : amount;
}

function begrotingTone(cents: number): "up" | "down" | undefined {
  const euros = Math.round(cents / 100);
  return euros > 0 ? "up" : euros < 0 ? "down" : undefined;
}

/** Hoe een post ervoor staat tegenover de begroting, of een streepje zonder begroting. */
function Begroting({ cents, counted, due, nl }: { cents: number | null; counted: number; due: number; nl: boolean }) {
  if (cents === null) {
    return (
      <span className="none" title={nl ? "Geen blad met een begroting" : "No sheet with a budget line"}>
        –
      </span>
    );
  }
  const title =
    counted < due
      ? nl
        ? `Over ${counted} van ${due} budgetten; de andere hebben geen regel Begroting in hun blad, of staan bewust buiten de begroting`
        : `Over ${counted} of ${due} budgets; the others have no Begroting line in their sheet, or were left out on purpose`
      : undefined;
  return (
    <span className="vtk-bo-devtext" data-tone={begrotingTone(cents)} title={title}>
      {begrotingText(cents, nl)}
    </span>
  );
}

/** Een kolomkop, met een korte vorm voor een smal scherm (`vtk-admin.css`). */
function Head({ long, short, className = "num" }: { long: string; short: string; className?: string }) {
  return (
    <th scope="col" className={className} title={long}>
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
      <span className="b">
        {nl ? "t.o.v. begroting" : "vs. annual plan"}{" "}
        <Begroting cents={s.begrotingCounted ? s.begrotingDev : null} counted={s.begrotingCounted} due={s.due} nl={nl} />
        {s.begrotingCounted > 0 && s.begrotingCounted < s.due && (
          <span className="of">
            {" "}
            {nl ? `(${s.begrotingCounted} van ${s.due})` : `(${s.begrotingCounted} of ${s.due})`}
          </span>
        )}
      </span>
    </div>
  );
  const line = (r: SummaryRow) => (
    <tr key={r.key} data-empty={r.due === 0 || undefined}>
      <th scope="row">{r.name}</th>
      <td className="num">{r.due}</td>
      <td className="num">{r.done}</td>
      <td className="num mis">{r.due ? r.missing : ""}</td>
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
      <td className="begr">
        {r.due === 0 ? "" : <Begroting cents={r.begroting} counted={r.begrotingCounted} due={r.due} nl={nl} />}
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
                  <Head long={nl ? "Missend" : "Missing"} short={nl ? "Mis." : "Miss."} className="num mis" />
                  <th scope="col" className="pct">%</th>
                  <th scope="col" className="begr" title={nl ? "Stand tegenover de begroting" : "Standing against the annual budget"}>
                    {nl ? "Begroting" : "vs. plan"}
                  </th>
                </tr>
              </thead>
              <tbody>{rows.map(line)}</tbody>
            </table>
          );
        })}
      </div>
      {summary.outOfPlan.length > 0 && (
        <p className="vtk-bo-sum-foot">
          <b>{nl ? "Buiten de begroting: " : "Left out of the plan: "}</b>
          {summary.outOfPlan.map((o, i) => (
            <Fragment key={o.key}>
              {i > 0 && "; "}
              {o.activity} ({[o.postName, o.reason].filter(Boolean).join(", ")})
            </Fragment>
          ))}
          .
        </p>
      )}
      <p className="vtk-bo-sum-foot">
        {nl
          ? "Budgetten: op een BO die al plaatsvond, of schriftelijk goedgekeurd. Percentage: daarvan met een resultaat. Rood onder 50%, oranje onder 100%, groen wanneer alles binnen is; een streepje: nog geen budget gepasseerd. Begroting: per budget het resultaat (of, zolang dat er niet is, het budget) min de regel Begroting in het blad, opgeteld; plus is beter dan begroot. Een blad zonder begroting telt niet mee."
          : "Budgets: at a meeting that already took place, or approved in writing. Percentage: of those, with a result. Red below 50%, orange below 100%, green when everything is in; a dash: no budget passed yet. vs. plan: per budget the result (or, until there is one, the budget) minus the Begroting line in the sheet, summed; plus is better than planned. A sheet without a Begroting line is left out."}
      </p>
    </section>
  );
}
