"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { ConfirmDialog, Input } from "@vtk/ui";
import { ConfirmIconButton } from "@/components/ui/DeleteIconButton";
import { IconAnchor } from "@/components/ui/IconButton";
import { ExternalLinkIcon, EyeOffIcon, UndoIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useUnsentGuard } from "@/components/ui/unsentGuard";
import { formatAmount } from "@/lib/rekeningen/expenses";
import type { SaveState } from "@/lib/saveState";
import type { BoLine, XDoc, XDossier } from "@/lib/bo/explorer";
import {
  excludeBoBegrotingAction,
  hideBoDocumentAction,
  includeBoBegrotingAction,
  unpairBoResultAction,
} from "@/app/actions/bestuursorgaan";
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

/**
 * De stand van een activiteit, altijd een van vier woorden met een vaste kleur:
 * Open (amber), Komt nog (grijs), Afgerond (groen), Geen budget. Wat erbij hoort
 * (hoeveel dagen, de afwijking, "via grocomeet") staat als tekst in
 * `StatusNote`, niet in de pil: vijf soorten labels in één kolom lazen als een
 * raadsel.
 */
export function StatusPill({ dossier: d, f }: { dossier: XDossier; f: Fmt }) {
  const { nl } = f;
  switch (d.status) {
    case "DONE":
      return <span className="vtk-bo-pill" data-tone="ok">{nl ? "Afgerond" : "Closed"}</span>;
    case "UPCOMING":
      return (
        <span className="vtk-bo-pill" title={nl ? "Het budget staat op een BO die nog moet komen" : "The budget is on a meeting still to come"}>
          {nl ? "Komt nog" : "Upcoming"}
        </span>
      );
    case "OPEN":
      return <span className="vtk-bo-pill" data-tone="low">Open</span>;
    case "NO_BUDGET":
      // Een resultaat van 25-26 op een BO van 26-27: zijn budget passeerde
      // voor de site meelas, en dat is geen fout.
      return d.results[0]?.workingYear !== d.year ? (
        <span className="vtk-bo-pill">{nl ? "Budget vorig jaar" : "Budget last year"}</span>
      ) : (
        <span className="vtk-bo-pill" data-tone="low">{nl ? "Geen budget" : "No budget"}</span>
      );
  }
}

export function StatusNote({ dossier, f }: { dossier: XDossier; f: Fmt }) {
  return statusNote(dossier, f);
}

/** Wat bij de stand hoort, als tekst: "16 dagen", "+€ 3,49", "via grocomeet". Null als er niets bij te zeggen valt. */
export function statusNote(d: XDossier, f: Fmt): ReactNode {
  const { nl } = f;
  switch (d.status) {
    case "OPEN":
      if (!d.date) return <span>{nl ? "schriftelijk" : "in writing"}</span>;
      return (
        <span className="tabular-nums" title={nl ? "Dagen sinds de BO van het budget" : "Days since the meeting of the budget"}>
          {d.overdueDays === 1 ? (nl ? "1 dag" : "1 day") : `${d.overdueDays ?? 0} ${nl ? "dagen" : "days"}`}
        </span>
      );
    case "DONE":
      if (d.waiver === "grocomeet") return <span>{nl ? "via grocomeet" : "via grocomeet"}</span>;
      if (d.waiver === "geen") return <span>{nl ? "zonder budget" : "without a budget"}</span>;
      if (d.devCents === null) return null;
      return (
        <span className="vtk-bo-devtext" data-tone={d.devCents > 0 ? "up" : d.devCents < 0 ? "down" : undefined} title={nl ? "Resultaat min budget" : "Result minus budget"}>
          {f.signed(d.devCents)}
        </span>
      );
    default:
      return null;
  }
}

/** De stand met wat erbij hoort, in één cel van een tabel. */
export function Stand({ d, f }: { d: XDossier; f: Fmt }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-vtk-muted">
      <StatusPill dossier={d} f={f} />
      <StatusNote dossier={d} f={f} />
    </span>
  );
}

/** Op welke BO's een activiteit passeerde: "BO 3 (30 aug) → BO 9". */
export function boRange(d: XDossier, f: Fmt): string {
  const parts = d.budgets.map((b, i) => (i === 0 && b.meetingDate ? `${b.meetingLabel} (${f.day(b.meetingDate)})` : b.meetingLabel)).join(", ");
  const result = d.results.at(-1);
  return [parts, result ? `→ ${result.meetingLabel}` : ""].filter(Boolean).join(" ") || "–";
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
          {d.overdueDays !== null && `, ${d.overdueDays} ${nl ? "dagen na het budget" : "days after the budget"}`}
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

/** Wat "Niet meetellen" uitlegt, voor een bestand of een hele activiteit. */
function hideText(nl: boolean, what: string, lastOf: string | null): string {
  const gone = lastOf
    ? nl
      ? ` Het is het enige bestand van "${lastOf}", dus die activiteit verdwijnt mee uit de lijst.`
      : ` It is the only file of "${lastOf}", so that activity disappears from the list too.`
    : "";
  return nl
    ? `${what} telt dan niet meer mee: niet in de lijst, niet in de cijfers en niet bij Na te kijken.${gone} In Drive verandert er niets, en de volgende scan zet het niet terug. Terugzetten kan onder Instellingen, bij "Niet meegeteld".`
    : `${what} no longer counts: not in the list, not in the numbers and not under To review.${gone} Nothing changes in Drive, and the next scan does not bring it back. You can restore it under Settings, at "Not counted".`;
}

/** "Niet meetellen" als icoon, voor één bestand in een lijst. */
export function HideFileButton({
  docId,
  name,
  activity,
  lastFile,
  sharedSheet,
  nl,
  errorMessages,
}: {
  docId: string;
  name: string;
  /** De activiteit, wanneer dit haar enige bestand is: dan verdwijnt ze mee. */
  activity?: string;
  lastFile?: boolean;
  /** Het blad is ook het budget (of het resultaat): dat gaat mee, want het is één bestand. */
  sharedSheet?: boolean;
  nl: boolean;
  errorMessages: Record<string, string>;
}) {
  const what = sharedSheet
    ? nl
      ? `Het blad "${name}", dat budget en resultaat in één is,`
      : `The sheet "${name}", which is both budget and result,`
    : nl
      ? `Het bestand "${name}"`
      : `The file "${name}"`;
  return (
    <ConfirmIconButton
      action={hideBoDocumentAction}
      fields={{ docIds: docId }}
      icon={<EyeOffIcon />}
      label={nl ? "Niet meetellen" : "Do not count"}
      srLabel={nl ? `Niet meetellen: ${name}` : `Do not count: ${name}`}
      title={nl ? "Dit bestand niet meetellen?" : "Stop counting this file?"}
      description={hideText(nl, what, lastFile && activity ? activity : null)}
      confirmLabel={nl ? "Niet meetellen" : "Do not count"}
      cancelLabel={nl ? "Annuleren" : "Cancel"}
      successMessage={nl ? `"${name}" telt niet meer mee.` : `"${name}" no longer counts.`}
      errorMessages={errorMessages}
    />
  );
}

/** Een action uitvoeren met de toast achteraf, en het vangnet voor wat de server niet bereikte. */
function useBoAction(nl: boolean, errorMessages: Record<string, string>) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();
  function run(action: (data: FormData) => Promise<SaveState>, fields: Record<string, string>, success: string, after?: () => void) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    startTransition(async () => {
      let result: SaveState;
      try {
        result = await action(data);
      } catch (error) {
        after?.();
        if (unsent.report(error)) return;
        throw error;
      }
      after?.();
      if (result.status === "error") {
        showToast({
          message: errorMessages[result.code] ?? (nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: success, variant: "success" });
    });
  }
  return { pending, run };
}

type CountChoice = "begroting" | "hide";

/**
 * "Niet meetellen" voor een hele activiteit, naast "Post wijzigen". De dialoog
 * vraagt hoe: enkel niet in de stand tegenover de begroting (de stad betaalt,
 * het blad is nog maar half; de activiteit blijft in het overzicht), of
 * helemaal niet (een kopie, een oude versie). Het eerste staat bovenaan: dat
 * is het vaakst bedoeld en het minst ingrijpend.
 */
export function HideDossierButton({
  dossier: d,
  nl,
  errorMessages,
  className = "vtk-bo-postedit-open",
}: {
  dossier: XDossier;
  nl: boolean;
  errorMessages: Record<string, string>;
  className?: string;
}) {
  const docs = [...d.budgets, ...d.results];
  const excluded = Boolean(d.begrotingExcluded);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<CountChoice>(excluded ? "hide" : "begroting");
  const [reason, setReason] = useState("");
  const { pending, run } = useBoAction(nl, errorMessages);
  const docIds = docs.map((doc) => doc.id).join(",");
  const what =
    docs.length === 1
      ? nl
        ? `Het bestand "${docs[0].name}"`
        : `The file "${docs[0].name}"`
      : nl
        ? `De ${docs.length} bestanden van "${d.activity}" (${docs.map((doc) => doc.name).join(", ")})`
        : `The ${docs.length} files of "${d.activity}" (${docs.map((doc) => doc.name).join(", ")})`;

  function show() {
    setChoice(excluded ? "hide" : "begroting");
    setReason("");
    setOpen(true);
  }

  function confirm() {
    if (choice === "begroting") {
      run(
        excludeBoBegrotingAction,
        { docIds, reason },
        nl ? `"${d.activity}" telt niet meer mee in de begroting.` : `"${d.activity}" no longer counts towards the annual plan.`,
        () => setOpen(false),
      );
    } else {
      run(
        hideBoDocumentAction,
        { docIds },
        nl ? `"${d.activity}" telt niet meer mee.` : `"${d.activity}" no longer counts.`,
        () => setOpen(false),
      );
    }
  }

  const option = (value: CountChoice, label: string, hint: string, extra?: ReactNode) => (
    <label className="vtk-bo-choice" data-checked={choice === value || undefined}>
      <input type="radio" name={`bo-count-${d.key}`} checked={choice === value} disabled={pending} onChange={() => setChoice(value)} />
      <span>
        <span className="t">{label}</span>
        <span className="h">{hint}</span>
        {choice === value && extra}
      </span>
    </label>
  );

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={nl ? `Niet meetellen: ${d.activity}` : `Do not count: ${d.activity}`}
        aria-haspopup="dialog"
        onClick={show}
      >
        <EyeOffIcon />
        {nl ? "Niet meetellen" : "Do not count"}
      </button>
      <ConfirmDialog
        open={open}
        title={nl ? `"${d.activity}" niet meetellen?` : `Stop counting "${d.activity}"?`}
        destructive={choice === "hide"}
        pending={pending}
        description={
          <div className="grid gap-2">
            {excluded ? (
              <p>
                {nl
                  ? "Telt al niet mee in de stand tegenover de begroting. Terugzetten kan in het detail of onder Instellingen."
                  : "Already left out of the standing against the annual plan. You can undo that in the detail or under Settings."}
              </p>
            ) : (
              option(
                "begroting",
                nl ? "Enkel niet in de begroting" : "Only not in the annual plan",
                nl
                  ? "Blijft in het overzicht (budget, resultaat, percentage), maar telt niet mee in de stand tegenover de begroting. Voor wat de stad betaalt, of een blad dat nog maar half is."
                  : "Stays in the overview (budget, result, percentage), but is left out of the standing against the annual plan. For what the city pays, or a sheet that is only half done.",
                <Input
                  className="mt-2"
                  value={reason}
                  maxLength={300}
                  disabled={pending}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={nl ? "Waarom? (optioneel, bv. betaald door de stad)" : "Why? (optional, e.g. paid by the city)"}
                  aria-label={nl ? "Waarom" : "Why"}
                />,
              )
            )}
            {option(
              "hide",
              nl ? "Helemaal niet meetellen" : "Do not count at all",
              hideText(nl, what, null),
            )}
          </div>
        }
        confirmLabel={
          choice === "begroting" ? (nl ? "Uit de begroting halen" : "Leave out of the plan") : nl ? "Niet meetellen" : "Do not count"
        }
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

/**
 * In het detail van een activiteit die niet meetelt in de begroting: waarom,
 * en meteen terugzetten. Zonder bevestiging: er gaat niets verloren, en
 * "Niet meetellen" zet het zo terug.
 */
export function BegrotingExcludedNote({
  dossier: d,
  nl,
  errorMessages,
}: {
  dossier: XDossier;
  nl: boolean;
  errorMessages: Record<string, string>;
}) {
  const { pending, run } = useBoAction(nl, errorMessages);
  if (!d.begrotingExcluded) return null;
  const docIds = [...d.budgets, ...d.results].map((doc) => doc.id).join(",");
  const reason = d.begrotingExcluded.reason;
  return (
    <p className="vtk-bo-note">
      {nl ? "Telt niet mee in de stand tegenover de begroting" : "Left out of the standing against the annual plan"}
      {reason ? `: ${reason}` : "."}{" "}
      <button
        type="button"
        className="vtk-bo-link"
        disabled={pending}
        onClick={() =>
          run(
            includeBoBegrotingAction,
            { docIds },
            nl ? `"${d.activity}" telt weer mee in de begroting.` : `"${d.activity}" counts towards the annual plan again.`,
          )
        }
      >
        {nl ? "Weer meetellen" : "Count again"}
      </button>
    </p>
  );
}

export function Files({ dossier: d, f, errorMessages }: { dossier: XDossier; f: Fmt; errorMessages: Record<string, string> }) {
  const { nl } = f;
  const file = (doc: XDoc) => {
    const notes = [
      doc.kind === "BUDGET" ? "Budget" : nl ? "Resultaat" : "Result",
      doc.meetingLabel,
      doc.alsoIn.length ? (nl ? `ook in ${doc.alsoIn.join(", ")}` : `also in ${doc.alsoIn.join(", ")}`) : null,
      doc.sharedSheet
        ? doc.kind === "BUDGET"
          ? nl
            ? "zelfde blad als het resultaat"
            : "same sheet as the result"
          : nl
            ? "zelfde blad als het budget"
            : "same sheet as the budget"
        : null,
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
        <HideFileButton
          docId={doc.id}
          name={doc.name}
          activity={d.activity}
          lastFile={new Set([...d.budgets, ...d.results].map((other) => other.fileKey)).size === 1}
          sharedSheet={doc.sharedSheet}
          nl={nl}
          errorMessages={errorMessages}
        />
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
