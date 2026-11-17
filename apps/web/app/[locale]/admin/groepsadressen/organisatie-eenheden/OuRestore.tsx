"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog, Input, Label } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import {
  type OuRestoreInput,
  type OuResult,
  type OuRow,
  applyOuRestoreAction,
  previewOuRestoreAction,
} from "./actions";

const SCOPE = "https://www.googleapis.com/auth/admin.reports.audit.readonly";

/**
 * Een periode kiezen, het logboek van de Admin console laten lezen, nakijken
 * en terugzetten. Uitvoeren leest op de server alles opnieuw; wat hier staat,
 * is enkel het voorbeeld.
 */
export function OuRestore({ nl, defaultSince }: { nl: boolean; defaultSince: string }) {
  const [since, setSince] = useState(defaultSince);
  const [until, setUntil] = useState("");
  const [onlySite, setOnlySite] = useState(true);
  const [result, setResult] = useState<OuResult | null>(null);
  const [checked, setChecked] = useState<OuRestoreInput | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();

  // `datetime-local` is de tijd van de browser; de server krijgt een tijdstip.
  const input = (): OuRestoreInput => ({
    since: since ? new Date(since).toISOString() : "",
    until: until ? new Date(until).toISOString() : "",
    onlySite,
  });
  const same = checked !== null && JSON.stringify(checked) === JSON.stringify(input());

  const errorText = (code: string) =>
    ({
      NOT_CONFIGURED: nl ? "Google Workspace is nog niet ingesteld." : "Google Workspace is not set up yet.",
      NOTHING_FOUND: nl
        ? "Geen verhuizingen van accounts gevonden in die periode."
        : "No account moves found in that period.",
      TOO_MANY: nl ? "Meer dan 400 accounts; kies een kortere periode." : "More than 400 accounts; pick a shorter period.",
      BAD_PERIOD: nl ? "Kies een begin dat voor het einde ligt." : "Pick a start before the end.",
    })[code] ?? (nl ? "Er ging iets mis." : "Something went wrong.");

  function report(r: OuResult) {
    if (r.status === "error" && r.code !== "NO_SCOPE") {
      showToast({ message: errorText(r.code), variant: "error", duration: 0 });
    }
  }

  function check() {
    const value = input();
    startTransition(async () => {
      const r = await unsent.run(() => previewOuRestoreAction(value));
      if (r === UNSENT) return;
      setResult(r);
      report(r);
      setChecked(r.status === "error" ? null : value);
    });
  }

  function apply() {
    if (!checked) return;
    const value = checked;
    startTransition(async () => {
      const r = await unsent.run(() => applyOuRestoreAction(value));
      setConfirming(false);
      if (r === UNSENT) return;
      setResult(r);
      report(r);
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
            : { message: nl ? `${r.moved} accounts teruggezet.` : `${r.moved} accounts restored.`, variant: "success" },
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
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Label htmlFor="ou-since">{nl ? "Vanaf" : "From"}</Label>
          <Input id="ou-since" type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
        </div>
        <div className="w-56">
          <Label htmlFor="ou-until">{nl ? "Tot (leeg = nu)" : "Until (empty = now)"}</Label>
          <Input id="ou-until" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
          <input type="checkbox" checked={onlySite} onChange={(e) => setOnlySite(e.target.checked)} />
          {nl ? "Enkel wat de site zelf verplaatste" : "Only what the site moved itself"}
        </label>
        <Button type="button" variant="ghost" size="sm" disabled={!since || pending} onClick={check}>
          {pending && !confirming ? (nl ? "Bezig met lezen..." : "Reading...") : nl ? "Uit Google lezen" : "Read from Google"}
        </Button>
      </div>

      {result?.status === "error" && result.code === "NO_SCOPE" && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            {nl
              ? "De site mag het logboek nog niet lezen. Dat zet je één keer aan in de Admin console:"
              : "The site may not read the log yet. Turn it on once in the Admin console:"}
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              {nl
                ? "Beveiliging → Toegang en gegevensbeheer → API-besturing → Domeinbrede delegatie beheren."
                : "Security → Access and data control → API controls → Manage domain-wide delegation."}
            </li>
            <li>
              {nl
                ? "Klik op het service-account van de site (de client-id uit Admin > IT) en dan Bewerken."
                : "Click the site's service account (the client ID from Admin > IT) and then Edit."}
            </li>
            <li>
              {nl ? "Voeg deze scope toe aan de lijst, met een komma ervoor, en bewaar:" : "Add this scope to the list, with a comma before it, and save:"}
              <code className="mt-1 block select-all break-all rounded bg-white px-2 py-1 text-xs text-vtk-ink">{SCOPE}</code>
            </li>
            <li>
              {nl
                ? "Wacht een paar minuten en klik opnieuw op \"Uit Google lezen\"."
                : "Wait a few minutes and click \"Read from Google\" again."}
            </li>
          </ol>
          {result.detail && <p className="text-xs opacity-80">Google: {result.detail}</p>}
        </div>
      )}

      {result && result.status !== "error" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-600">
            {nl
              ? `${result.events} verhuizingen gelezen, ${rows.length} accounts, ${toMove.length} gaan terug.`
              : `${result.events} moves read, ${rows.length} accounts, ${toMove.length} will be restored.`}
            {result.skippedHuman > 0 &&
              (nl
                ? ` ${result.skippedHuman} verhuizingen door een mens niet meegeteld.`
                : ` ${result.skippedHuman} moves by a person not counted.`)}
          </p>
          {result.status === "preview" && toMove.length > 0 && (
            <Button type="button" size="sm" disabled={pending || !same} onClick={() => setConfirming(true)}>
              {nl ? `${toMove.length} accounts terugzetten` : `Restore ${toMove.length} accounts`}
            </Button>
          )}
          {result.status === "preview" && !same && (
            <span className="text-xs text-amber-800">
              {nl ? "De periode veranderde; lees opnieuw." : "The period changed; read again."}
            </span>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="relative max-h-[60vh] overflow-auto rounded-xl border border-vtk-blue/15 bg-white">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="sticky top-0 border-b border-vtk-blue/10 bg-white text-left text-xs uppercase tracking-wide text-zinc-500">
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
