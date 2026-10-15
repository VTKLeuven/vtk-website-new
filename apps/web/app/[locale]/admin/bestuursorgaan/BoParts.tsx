"use client";

import { Fragment, type ReactNode } from "react";
import { ConfirmIconButton } from "@/components/ui/DeleteIconButton";
import { IconAnchor } from "@/components/ui/IconButton";
import { ExternalLinkIcon, UndoIcon } from "@/components/ui/icons";
import { formatAmount } from "@/lib/rekeningen/expenses";
import type { BoLine, XDoc, XDossier } from "@/lib/bo/explorer";
import { unpairBoResultAction } from "@/app/actions/bestuursorgaan";
import { figuresErrorText } from "./messages";

/*
 * Wat de twee weergaven van /admin/bestuursorgaan delen (de verkenner in
 * `BoExplorer.tsx` en de lijst in `BoList.tsx`): de opmaak van bedragen en
 * datums, de stand van een activiteit, en de drie bladen over één activiteit
 * (bedragen per post, tijdlijn, bestanden). Eén keer, zodat de twee weergaven
 * nooit iets anders zeggen over dezelfde activiteit.
 */

export type Locale = "nl" | "en";
export type Sheet = "bedragen" | "tijdlijn" | "bestanden";

export function useFormat(locale: Locale) {
  const nl = locale === "nl";
  const euro = (cents: number | null) => (cents === null ? "–" : `€ ${formatAmount(cents, locale)}`);
  // Het plusteken mag niet op een andere regel belanden dan het bedrag.
  const signed = (cents: number | null) => (cents === null ? "–" : `${cents > 0 ? "+⁠" : ""}${euro(cents)}`);
  const euro0 = (cents: number) => `€ ${Math.round(cents / 100).toLocaleString(nl ? "nl-BE" : "en-GB")}`;
  const signed0 = (cents: number) => `${cents > 0 ? "+⁠" : ""}${euro0(cents)}`;
  const day = (iso: string | null, withYear = false) =>
    iso
      ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
          ...(withYear ? { weekday: "short", year: "numeric" } : {}),
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        })
      : "";
  const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)}%`);
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return { nl, euro, signed, euro0, signed0, day, pct, count };
}


export type Fmt = ReturnType<typeof useFormat>;

export function Progress({ value }: { value: number | null }) {
  return (
    <span className="vtk-bo-prog" aria-hidden="true">
      <span style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </span>
  );
}

export function StatusPill({ dossier: d, f }: { dossier: XDossier; f: Fmt }) {
  const { nl } = f;
  switch (d.status) {
    case "DONE":
      if (d.waiver === "grocomeet")
        return (
          <span className="vtk-bo-pill" data-tone="ok" title={nl ? "Geen budget op het BO: versneld goedgekeurd door de grocomeet" : "No budget at the meeting: approved early by the grocomeet"}>
            {nl ? "Via grocomeet" : "Via grocomeet"}
          </span>
        );
      if (d.waiver === "geen")
        return (
          <span className="vtk-bo-pill" data-tone="ok" title={nl ? "Geen budget nodig" : "No budget needed"}>
            {nl ? "Zonder budget" : "Without budget"}
          </span>
        );
      if (d.devCents === null) return <span className="vtk-bo-pill" data-tone="ok">{nl ? "Afgerond" : "Closed"}</span>;
      return (
        <span className="vtk-bo-dev" data-tone={d.devCents > 0 ? "up" : d.devCents < 0 ? "down" : undefined} title={nl ? "Resultaat min budget" : "Result minus budget"}>
          {f.signed(d.devCents)}
        </span>
      );
    case "UPCOMING":
      return <span className="vtk-bo-pill">{nl ? `Op ${f.day(d.eventDate)}` : `On ${f.day(d.eventDate)}`}</span>;
    case "OPEN":
      return (
        <span
          className="vtk-bo-pill"
          data-tone="low"
          title={d.eventDate ? (nl ? `De activiteit was op ${f.day(d.eventDate, true)}` : `The activity was on ${f.day(d.eventDate, true)}`) : nl ? "Het budget noemt geen datum" : "The budget names no date"}
        >
          {d.eventDate ? `Open · ${d.overdueDays ?? 0} d` : nl ? "Open · geen datum" : "Open · no date"}
        </span>
      );
    case "NO_BUDGET":
      return (
        // Een resultaat van 25-26 op een BO van 26-27: zijn budget passeerde
        // voor de site meelas, en dat is geen fout.
        <span className="vtk-bo-pill" data-tone={d.results[0]?.workingYear !== d.year ? undefined : "low"}>
          {d.results[0]?.workingYear !== d.year
            ? nl
              ? `Budget van ${String(d.year % 100).padStart(2, "0")}-${String((d.year + 1) % 100).padStart(2, "0")}`
              : `Budget from ${d.year}`
            : nl
              ? "Geen budget gevonden"
              : "No budget found"}
        </span>
      );
  }
}

/** De post(en) van een activiteit als links, "Cultuur + Onthaal". */
export function PostLinks({
  dossier: d,
  onPost,
  className = "vtk-bo-kicker",
}: {
  dossier: XDossier;
  onPost: (key: string) => void;
  className?: string;
}) {
  return (
    <span className={className}>
      {d.postKeys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && " + "}
          <button type="button" className="vtk-bo-link" onClick={() => onPost(key)}>
            {d.postNames[i]}
          </button>
        </Fragment>
      ))}
    </span>
  );
}

/** Wat over een activiteit te weten valt en niet in een bedrag past. */
export function dossierNotes(d: XDossier, f: Fmt): string[] {
  const { nl } = f;
  return [
    d.postKeys.length > 1
      ? nl
        ? `Hoort bij ${d.postNames.join(" en ")}: het telt bij elk van hen mee, en één keer in het totaal.`
        : `Belongs to ${d.postNames.join(" and ")}: it counts for each of them, and once in the total.`
      : null,
    d.overridden
      ? nl
        ? "De post is met de hand gekozen en komt niet uit de naam van het bestand."
        : "The post was chosen by hand and does not come from the file name."
      : null,
    d.dateIgnored
      ? nl
        ? `Het rekenblad noemt ${f.day(d.dateIgnored, true)} als datum. Dat past niet bij de BO's van dit budget (een oud sjabloon?), dus de site rekent alsof er geen datum staat.`
        : `The spreadsheet gives ${f.day(d.dateIgnored, true)} as the date. That does not fit the meetings of this budget (an old template?), so the site treats it as having no date.`
      : null,
  ].filter((note): note is string => Boolean(note));
}

export function Tiles({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="vtk-bo-tiles">
      {items.map(([label, value, note]) => (
        <div key={label}>
          <span className="l">{label}</span>
          <span className="v">{value}</span>
          {note && <span className="n">{note}</span>}
        </div>
      ))}
    </div>
  );
}

/** Wat het blad Bedragen toont: van één activiteit, of opgeteld over een post. */
export type LinesData = {
  lines: BoLine[];
  hasResult: boolean;
  budgetCents: number | null;
  resultCents: number | null;
  devCents: number | null;
  /** Null laat de regel Begroting weg. */
  allocationCents: number | null;
  /** Waarom er geen posten zijn, als er geen zijn. */
  empty: string;
};

export function linesOf(d: XDossier, nl: boolean): LinesData {
  const error = [...d.results, ...d.budgets].find((doc) => doc.figuresError)?.figuresError;
  return {
    lines: d.lines,
    hasResult: d.results.length > 0 && d.lines.some((l) => l.resultCents !== null),
    budgetCents: d.budgetCents,
    resultCents: d.results.length ? d.resultCents : null,
    devCents: d.devCents,
    allocationCents: d.allocationCents,
    empty: error
      ? figuresErrorText(error, nl)
      : nl
        ? "Het rekenblad noemt geen posten onder Inkomsten of Uitgaven."
        : "The spreadsheet lists no lines under income or expenses.",
  };
}

/**
 * De posten van meerdere activiteiten samengeteld per naam ("Drank" van elke
 * afgeronde activiteit van een post). Enkel activiteiten met een resultaat:
 * anders staat een budget zonder tegenhanger naast een opgeteld resultaat.
 */
export function sumLines(dossiers: XDossier[], nl: boolean): LinesData {
  const done = dossiers.filter((d) => d.status === "DONE" && d.lines.some((l) => l.resultCents !== null));
  const byLabel = new Map<string, BoLine>();
  for (const d of done) {
    for (const l of d.lines) {
      const key = `${l.side}|${l.label.trim().toLowerCase()}`;
      const line = byLabel.get(key) ?? { label: l.label.trim(), side: l.side, budgetCents: 0, resultCents: 0 };
      line.budgetCents = (line.budgetCents ?? 0) + (l.budgetCents ?? 0);
      line.resultCents = (line.resultCents ?? 0) + (l.resultCents ?? 0);
      byLabel.set(key, line);
    }
  }
  const sum = (pick: (d: XDossier) => number | null) => done.reduce((total, d) => total + (pick(d) ?? 0), 0);
  return {
    lines: [...byLabel.values()].sort((a, b) => (b.budgetCents ?? 0) - (a.budgetCents ?? 0)),
    hasResult: true,
    budgetCents: sum((d) => d.budgetCents),
    resultCents: sum((d) => d.resultCents),
    devCents: sum((d) => d.devCents),
    allocationCents: null,
    empty: nl ? "Nog geen afgeronde activiteit met posten in het rekenblad." : "No closed activity with lines in the spreadsheet yet.",
  };
}

export function Lines({ data, f }: { data: LinesData; f: Fmt }) {
  const { nl } = f;
  if (data.lines.length === 0) return <p className="text-sm text-vtk-muted">{data.empty}</p>;
  const { hasResult } = data;
  const max = Math.max(...data.lines.map((l) => Math.max(Math.abs(l.budgetCents ?? 0), Math.abs(l.resultCents ?? 0))), 1);
  // Bij een inkomst is meer beter, bij een kost minder.
  const diff = (l: BoLine) =>
    hasResult && l.budgetCents !== null && l.resultCents !== null
      ? l.side === "in"
        ? l.resultCents - l.budgetCents
        : l.budgetCents - l.resultCents
      : null;
  const line = (l: BoLine, i: number) => (
    <div key={`${l.side}-${i}`} className="vtk-bo-line">
      <span className="vtk-bo-line-label">{l.label}</span>
      <span className="bars" aria-hidden="true">
        <span data-series="budget" style={{ width: `${(Math.abs(l.budgetCents ?? 0) / max) * 100}%` }} />
        {hasResult && <span data-series="result" style={{ width: `${(Math.abs(l.resultCents ?? 0) / max) * 100}%` }} />}
      </span>
      <span className="num">{f.euro(l.budgetCents)}</span>
      <span className="num">{hasResult ? f.euro(l.resultCents) : "–"}</span>
      <span className="num">{diff(l) === null ? "" : f.signed(diff(l))}</span>
    </div>
  );
  const ins = data.lines.filter((l) => l.side === "in");
  const outs = data.lines.filter((l) => l.side === "out");
  return (
    <div className="vtk-bo-lines">
      <div className="vtk-bo-legend">
        <span><i data-series="budget" />Budget</span>
        {hasResult && <span><i data-series="result" />{nl ? "Resultaat" : "Result"}</span>}
        <span className="text-vtk-muted">{nl ? "Verschil: positief is beter dan gepland" : "Difference: positive is better than planned"}</span>
      </div>
      <div className="vtk-bo-line head">
        <span>{nl ? "Post" : "Line"}</span>
        <span />
        <span className="num">Budget</span>
        <span className="num">{nl ? "Resultaat" : "Result"}</span>
        <span className="num">{nl ? "Verschil" : "Difference"}</span>
      </div>
      {ins.length > 0 && <div className="vtk-bo-lines-section">{nl ? "Inkomsten" : "Income"}</div>}
      {ins.map(line)}
      {outs.length > 0 && <div className="vtk-bo-lines-section">{nl ? "Uitgaven" : "Expenses"}</div>}
      {outs.map(line)}
      <div className="vtk-bo-line total">
        <span>{nl ? "Netto" : "Net"}</span>
        <span />
        <span className="num">{f.euro(data.budgetCents)}</span>
        <span className="num">{hasResult ? f.euro(data.resultCents) : "–"}</span>
        <span className="num">{data.devCents === null ? "" : f.signed(data.devCents)}</span>
      </div>
      {data.allocationCents !== null && (
        <div className="vtk-bo-line muted">
          <span>{nl ? "Begroting" : "Allocation"}</span>
          <span />
          <span className="num">{f.euro(data.allocationCents)}</span>
          <span />
          <span className="num">{data.budgetCents !== null ? f.signed(data.budgetCents - data.allocationCents) : ""}</span>
        </div>
      )}
    </div>
  );
}

export function Timeline({ dossier: d, f, onMeeting }: { dossier: XDossier; f: Fmt; onMeeting: (id: string) => void }) {
  const { nl } = f;
  type Step = { date: string; kind: "budget" | "event" | "result" | "open"; text: ReactNode; meetingId?: string };
  const steps: Step[] = [];
  d.budgets.forEach((b, i) =>
    steps.push({
      date: b.meetingDate ?? "",
      kind: "budget",
      meetingId: b.meetingId,
      text: (
        <>
          <b>{i > 0 ? (nl ? "Nieuwe versie van het budget" : "New version of the budget") : "Budget"}</b> {nl ? "op" : "at"} {b.meetingLabel}: {f.euro(b.totalCents)}
        </>
      ),
    }),
  );
  if (d.eventDate) steps.push({ date: d.eventDate, kind: "event", text: <><b>{nl ? "Activiteit" : "Activity"}</b>{d.location && ` ${nl ? "in" : "in"} ${d.location}`}</> });
  for (const r of d.results) {
    steps.push({
      date: r.meetingDate ?? "",
      kind: "result",
      meetingId: r.meetingId,
      text: (
        <>
          <b>{nl ? "Resultaat" : "Result"}</b> {nl ? "op" : "at"} {r.meetingLabel}: {f.euro(r.totalCents)}
          {d.lagDays !== null && <span className="text-vtk-muted"> ({d.lagDays} {nl ? "dagen na de activiteit" : "days after the activity"})</span>}
        </>
      ),
    });
  }
  if (d.status === "OPEN") {
    steps.push({
      date: "9999",
      kind: "open",
      text: (
        <>
          <b>{nl ? "Vandaag" : "Today"}</b>: {nl ? "nog geen resultaat" : "no result yet"}
          {d.overdueDays !== null && `, ${d.overdueDays} ${nl ? (d.eventDate ? "dagen na de activiteit" : "dagen na het budget") : d.eventDate ? "days after the activity" : "days after the budget"}`}
        </>
      ),
    });
  }
  steps.sort((a, b) => a.date.localeCompare(b.date));
  return (
    <ol className="vtk-bo-steps">
      {steps.map((s, i) => (
        <li key={i} data-kind={s.kind}>
          <span className="d">{s.kind === "open" ? "" : f.day(s.date)}</span>
          <span className="m" aria-hidden="true" />
          <span>
            {s.text}
            {s.meetingId && (
              <>
                {" "}
                <button type="button" className="vtk-bo-link text-xs" onClick={() => onMeeting(s.meetingId!)}>
                  {nl ? "bekijk BO" : "view meeting"}
                </button>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Files({ dossier: d, f, errorMessages }: { dossier: XDossier; f: Fmt; errorMessages: Record<string, string> }) {
  const { nl } = f;
  const file = (doc: XDoc) => {
    const notes = [
      doc.kind === "BUDGET" ? "Budget" : nl ? "Resultaat" : "Result",
      doc.meetingLabel,
      doc.paired ? (nl ? "met de hand bij het budget gezet" : "linked to the budget by hand") : null,
      doc.waiver === "grocomeet" ? (nl ? "zonder budget: versneld goedgekeurd door de grocomeet" : "without a budget: approved early by the grocomeet") : null,
      doc.waiver === "geen" ? (nl ? "zonder budget: geen budget nodig" : "without a budget: none needed") : null,
      doc.overridden ? (nl ? "posten met de hand gekozen" : "posts chosen by hand") : null,
      doc.folderConflict ? (doc.kind === "BUDGET" ? (nl ? "stond in Resultaten" : "was in Resultaten") : nl ? "stond in Budgetten" : "was in Budgetten") : null,
      doc.missing ? (nl ? "niet meer in Drive" : "no longer in Drive") : null,
      doc.figuresError ? figuresErrorText(doc.figuresError, nl) : null,
    ].filter(Boolean);
    return (
      <li key={doc.id} className="vtk-bo-file">
        <span className="min-w-0 flex-1">
          <b className="break-words">{doc.name}</b>
          <span className="block text-xs text-vtk-muted">{notes.join(" · ")}</span>
        </span>
        {(doc.paired || doc.waiver) && (
          <ConfirmIconButton
            action={unpairBoResultAction}
            fields={{ resultId: doc.id }}
            icon={<UndoIcon />}
            label={nl ? "Koppeling ongedaan maken" : "Undo link"}
            srLabel={nl ? `Koppeling ongedaan maken: ${doc.name}` : `Undo link: ${doc.name}`}
            title={nl ? "Koppeling ongedaan maken?" : "Undo the link?"}
            description={
              doc.waiver
                ? nl
                  ? `Het resultaat "${doc.name}" telt dan weer als resultaat zonder budget en komt terug bij Na te kijken. Er wordt niets in Drive gewijzigd.`
                  : `The result "${doc.name}" counts as a result without a budget again and returns to To review. Nothing changes in Drive.`
                : nl
                  ? `Het resultaat "${doc.name}" staat dan weer los van dit budget en komt terug bij Na te kijken. Er wordt niets in Drive gewijzigd.`
                  : `The result "${doc.name}" is separated from this budget again and returns to To review. Nothing changes in Drive.`
            }
            confirmLabel={nl ? "Ongedaan maken" : "Undo"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Koppeling ongedaan gemaakt." : "Link undone."}
            errorMessages={errorMessages}
          />
        )}
        <IconAnchor
          href={doc.webUrl}
          target="_blank"
          rel="noreferrer"
          label={nl ? "Openen in Drive" : "Open in Drive"}
          srLabel={nl ? `Openen in Drive: ${doc.name}` : `Open in Drive: ${doc.name}`}
        >
          <ExternalLinkIcon />
        </IconAnchor>
      </li>
    );
  };
  return <ul className="vtk-bo-files">{[...d.budgets, ...d.results].map(file)}</ul>;
}
