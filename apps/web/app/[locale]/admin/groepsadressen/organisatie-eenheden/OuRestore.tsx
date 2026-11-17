"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import { type OuResult, type OuRow, applyOuRestoreAction, previewOuRestoreAction } from "./actions";

/**
 * Plakken, nakijken, terugzetten. Uitvoeren rekent op de server opnieuw uit
 * dezelfde tekst; wat hier getoond werd, is enkel het voorbeeld.
 */
export function OuRestore({ nl }: { nl: boolean }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<OuResult | null>(null);
  const [checkedText, setCheckedText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();

  const errorText = (code: string) =>
    ({
      NOT_CONFIGURED: nl ? "Google Workspace is nog niet ingesteld." : "Google Workspace is not set up yet.",
      NOTHING_FOUND: nl
        ? "Geen regels \"... is verplaatst van ... naar ...\" gevonden in wat je plakte."
        : "No lines \"... was moved from ... to ...\" found in what you pasted.",
      TOO_MANY: nl ? "Meer dan 400 accounts; plak het in delen." : "More than 400 accounts; paste it in parts.",
    })[code] ?? (nl ? "Er ging iets mis." : "Something went wrong.");

  function check() {
    startTransition(async () => {
      const r = await unsent.run(() => previewOuRestoreAction(text));
      if (r === UNSENT) return;
      if (r.status === "error") {
        showToast({ message: errorText(r.code), variant: "error", duration: 0 });
        setResult(null);
        return;
      }
      setResult(r);
      setCheckedText(text);
    });
  }

  function apply() {
    startTransition(async () => {
      const r = await unsent.run(() => applyOuRestoreAction(checkedText));
      setConfirming(false);
      if (r === UNSENT) return;
      if (r.status === "error") {
        showToast({ message: errorText(r.code), variant: "error", duration: 0 });
        return;
      }
      setResult(r);
      if (r.status === "applied") {
        showToast(
          r.failed
            ? {
                message: nl
                  ? `${r.moved} accounts teruggezet, ${r.failed} niet gelukt; zie de tabel.`
                  : `${r.moved} accounts restored, ${r.failed} failed; see the table.`,
                variant: "error",
                duration: 0,
              }
            : {
                message: nl ? `${r.moved} accounts teruggezet.` : `${r.moved} accounts restored.`,
                variant: "success",
              },
        );
      }
    });
  }

  const rows: OuRow[] = result && result.status !== "error" ? result.rows : [];
  const toMove = rows.filter((r) => r.status === "move");
  const statusText = (r: OuRow) =>
    r.error
      ? `${nl ? "fout" : "error"}: ${r.error}`
      : {
          move: nl ? "gaat terug" : "will be restored",
          done: nl ? "staat goed" : "in place",
          changed: nl ? `intussen in ${r.current}; blijft` : `now in ${r.current}; stays`,
          missing: nl ? "geen account" : "no account",
        }[r.status];

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
        <li>
          {nl
            ? "Admin console → Rapportage → Audit en onderzoek → Logboekgebeurtenissen beheerder."
            : "Admin console → Reporting → Audit and investigation → Admin log events."}
        </li>
        <li>
          {nl
            ? "Filter op de gebeurtenis \"Organisatie-eenheid gebruiker gewijzigd\" en de periode, zet 100 rijen per pagina."
            : "Filter on the event \"Change user organisational unit\" and the period, show 100 rows per page."}
        </li>
        <li>
          {nl
            ? "Selecteer de rijen en kopieer ze (of exporteer naar Spreadsheets en kopieer de kolommen), en plak alles hieronder. Meer pagina's mogen na elkaar."
            : "Select the rows and copy them (or export to Sheets and copy the columns), and paste everything below. Several pages can follow each other."}
        </li>
      </ol>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="2026-11-16T15:01:26+01:00   Organisatie-eenheid gebruiker gewijzigd   yoran.weustenberg@vtk.be is verplaatst van /Praesidium naar /   ..."
        aria-label={nl ? "Regels uit het logboek" : "Lines from the log"}
        className="w-full rounded-xl border border-vtk-blue/15 bg-white p-3 font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" disabled={!text.trim() || pending} onClick={check}>
          {pending && !confirming ? (nl ? "Bezig met nakijken..." : "Checking...") : nl ? "Nakijken" : "Check"}
        </Button>
        {result?.status === "preview" && toMove.length > 0 && (
          <Button type="button" size="sm" disabled={pending || text !== checkedText} onClick={() => setConfirming(true)}>
            {nl ? `${toMove.length} accounts terugzetten` : `Restore ${toMove.length} accounts`}
          </Button>
        )}
        {result && text !== checkedText && (
          <span className="text-xs text-amber-800">
            {nl ? "De tekst veranderde; kijk opnieuw na." : "The text changed; check again."}
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div className="relative overflow-x-auto rounded-xl border border-vtk-blue/15 bg-white">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">{nl ? "Account" : "Account"}</th>
                <th className="px-3 py-2 font-medium">{nl ? "Nu" : "Now"}</th>
                <th className="px-3 py-2 font-medium">{nl ? "Stond in" : "Was in"}</th>
                <th className="px-3 py-2 font-medium">{nl ? "Status" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email} className="border-b border-vtk-blue/5 last:border-0">
                  <td className="break-all px-3 py-1.5 text-vtk-ink">{r.email}</td>
                  <td className="px-3 py-1.5 text-zinc-600">{r.current ?? "-"}</td>
                  <td className="px-3 py-1.5 text-zinc-600">{r.restoreTo}</td>
                  <td className={`px-3 py-1.5 text-xs ${r.error ? "text-red-700" : r.status === "move" ? "text-vtk-ink" : "text-zinc-500"}`}>
                    {statusText(r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        destructive={false}
        title={nl ? `${toMove.length} accounts terugzetten?` : `Restore ${toMove.length} accounts?`}
        description={
          nl
            ? "Elk account gaat terug naar de organisatie-eenheid waar het stond, enkel als het nog staat waar de verhuizing het zette. De regels van die OU gelden meteen weer; mail, bestanden en groepen blijven zoals ze zijn."
            : "Each account goes back to the organisational unit it was in, only if it is still where the move put it. The rules of that OU apply again right away; mail, files and groups stay as they are."
        }
        confirmLabel={pending ? (nl ? "Bezig..." : "Working...") : nl ? "Terugzetten" : "Restore"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={apply}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
