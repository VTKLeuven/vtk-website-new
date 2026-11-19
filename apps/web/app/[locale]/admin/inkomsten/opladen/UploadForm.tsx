"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { FileField } from "@/components/ui/FileField";
import { InfoTip } from "@/components/ui/InfoTip";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { combineImportSummaries } from "@/lib/inkomsten/importSummary";
import type { ImportFilePreview, ImportPreviewState } from "@/app/actions/inkomsten";
import { SOURCE_LABELS } from "../shared";

/**
 * Eén of meer exports kiezen of slepen, eerst zien wat opladen zou doen, en pas
 * dan bewaren. Europabank geeft een bestand per dag, dus een kwartaal zijn er
 * tientallen: die gaan samen. De voorvertoning en het opladen rekenen op
 * dezelfde manier (`importIncomeExport`), dus wat hier staat, is wat er gebeurt.
 */
export function UploadForm({
  locale,
  previewAction,
  importAction,
  errorMessages,
}: {
  locale: "nl" | "en";
  previewAction: (formData: FormData) => Promise<ImportPreviewState>;
  importAction: SaveAction;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const [preview, setPreview] = useState<ImportPreviewState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const number = (value: number) => value.toLocaleString(nl ? "nl-BE" : "en-GB");
  const day = (value: Date | null) => (value ? new Date(value).toLocaleDateString(nl ? "nl-BE" : "en-GB") : "");
  const cannotRead = (file: Extract<ImportFilePreview, { ok: false }>) =>
    (errorMessages[file.code] ?? (nl ? "Dat bestand kan de site niet lezen." : "The site cannot read that file.")) +
    (file.detail ? ` (${file.detail})` : "");

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      setPreview({ status: "idle" });
      return;
    }
    const form = new FormData();
    for (const file of Array.from(files)) form.append("file", file);
    startTransition(async () => {
      const result = await unsentGuard.run(() => previewAction(form));
      if (result !== UNSENT) setPreview(result);
    });
  }

  const files = preview.status === "preview" ? preview.files : [];
  const good = files.flatMap((file) => (file.ok ? [file.summary] : []));
  const failed = files.flatMap((file) => (file.ok ? [] : [file]));
  const several = files.length > 1;
  const totals = good.length > 0 ? combineImportSummaries(good) : null;
  const matched = totals
    ? totals.rules.WEBSITE + totals.rules.CODE_IN_TEXT + totals.rules.CASH_REGISTER + totals.rules.NAME_RULE + totals.rules.CHANNEL_DEFAULT
    : 0;

  return (
    <SaveForm
      action={importAction}
      submitLabel={nl ? "Uploaden" : "Upload"}
      savingLabel={nl ? "Bezig met uploaden..." : "Uploading..."}
      savedMessage={nl ? "Geüpload." : "Uploaded."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Uploaden mislukt." : "Upload failed."}
      submitDisabled={pending || !totals || failed.length > 0 || totals.created + totals.updated + totals.payouts === 0}
      onSuccess={() => {
        setPreview({ status: "idle" });
        router.refresh();
      }}
      className="space-y-4"
    >
      <FileField
        name="file"
        accept=".csv,text/csv"
        multiple
        required
        locale={locale}
        chooseLabel={nl ? "Exports kiezen" : "Choose exports"}
        hint={
          nl
            ? "Eén of meer CSV's van Payconiq, Mollie, SumUp of Europabank, gerust allemaal tegelijk; slepen kan ook."
            : "One or more CSVs from Payconiq, Mollie, SumUp or Europabank, all at once if you like; dragging works too."
        }
        onChange={onFiles}
      />

      {pending ? <p className="text-sm text-vtk-muted">{nl ? "Bestanden lezen..." : "Reading files..."}</p> : null}

      {preview.status === "error" ? (
        <p className="rounded-xl border border-vtk-danger-line bg-vtk-danger-soft px-4 py-3 text-sm text-vtk-danger" role="alert">
          {errorMessages[preview.code] ?? (nl ? "Dat bestand kan de site niet lezen." : "The site cannot read that file.")}
          {preview.detail ? ` (${preview.detail})` : ""}
        </p>
      ) : null}

      {failed.length > 0 && !pending ? (
        <div className="rounded-xl border border-vtk-danger-line bg-vtk-danger-soft px-4 py-3 text-sm text-vtk-danger" role="alert">
          {several ? (
            <>
              <p className="font-medium">
                {nl
                  ? `${failed.length} van de ${files.length} bestanden kan de site niet lezen. Laat ze weg en kies opnieuw; er is nog niets geüpload.`
                  : `The site cannot read ${failed.length} of the ${files.length} files. Leave them out and choose again; nothing has been uploaded yet.`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {failed.slice(0, 10).map((file) => (
                  <li key={file.fileName}>
                    <span className="font-medium">{file.fileName}</span>: {cannotRead(file)}
                  </li>
                ))}
                {failed.length > 10 ? <li>{nl ? `En nog ${failed.length - 10}.` : `And ${failed.length - 10} more.`}</li> : null}
              </ul>
            </>
          ) : (
            <p>{cannotRead(failed[0])}</p>
          )}
        </div>
      ) : null}

      {totals && !pending ? (
        <div className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 px-4 py-3 text-sm">
          <p className="font-medium">
            {several ? `${good.length} ${nl ? "bestanden" : "files"} · ` : ""}
            {totals.sources.map((source) => SOURCE_LABELS[source]).join(", ")}
            {totals.firstAt ? ` · ${day(totals.firstAt)} ${nl ? "tot" : "to"} ${day(totals.lastAt)}` : ""}
          </p>
          {/* Vier getallen die zeggen wat er gebeurt; hoe het gekoppeld werd, staat eronder. */}
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <Stat label={nl ? "Nieuw" : "New"} value={number(totals.created)} />
            <Stat label={nl ? "Automatisch gekoppeld" : "Matched automatically"} value={number(matched)} />
            <Stat label={nl ? "Na te kijken" : "To review"} value={number(totals.rules.OPEN)} />
            <Stat label={nl ? "Al eerder geüpload" : "Already uploaded"} value={number(totals.duplicates)} />
          </dl>
          {totals.locked ? (
            <p className="mt-2 text-vtk-warn">
              {nl
                ? `${number(totals.locked)} ${totals.locked === 1 ? "regel valt" : "regels vallen"} in een afgesloten periode en ${totals.locked === 1 ? "komt" : "komen"} er niet bij.`
                : `${number(totals.locked)} ${totals.locked === 1 ? "row falls" : "rows fall"} in a closed period and ${totals.locked === 1 ? "is" : "are"} not added.`}
            </p>
          ) : null}
          <details className="mt-3">
            <summary className="cursor-pointer text-vtk-muted">{nl ? "Details per koppelregel" : "Details per matching rule"}</summary>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              <Stat label={nl ? (several ? "Regels in de bestanden" : "Regels in het bestand") : several ? "Rows in the files" : "Rows in the file"} value={number(totals.total)} />
              <Stat label={nl ? "Betaling van de site" : "Payment from the site"} value={number(totals.rules.WEBSITE)} />
              <Stat label={nl ? "Code in de tekst" : "Code in the text"} value={number(totals.rules.CODE_IN_TEXT)} />
              {totals.rules.CASH_REGISTER ? (
                <Stat label={nl ? "Een kassa" : "A cash register"} value={number(totals.rules.CASH_REGISTER)} />
              ) : null}
              <Stat label={nl ? "Onthouden tekst" : "Remembered text"} value={number(totals.rules.NAME_RULE)} />
              {totals.rules.CHANNEL_DEFAULT ? (
                <Stat label={nl ? "Standaardcode van het kanaal" : "Default code of the channel"} value={number(totals.rules.CHANNEL_DEFAULT)} />
              ) : null}
              {totals.feeRows ? <Stat label={nl ? "Kosten en reserve" : "Fees and reserve"} value={number(totals.feeRows)} /> : null}
              {totals.updated ? <Stat label={nl ? "Nu uitbetaald" : "Now paid out"} value={number(totals.updated)} /> : null}
              {totals.payouts ? <Stat label={nl ? "Uitbetalingen, nieuw of gewijzigd" : "Payouts, new or changed"} value={number(totals.payouts)} /> : null}
              <Stat label={nl ? "Telt niet mee (mislukt, vervallen, geweigerd)" : "Does not count (failed, expired, denied)"} value={number(totals.skipped)} />
              {totals.ignored ? (
                <Stat
                  label={
                    <span className="inline-flex items-center gap-1">
                      {nl ? "Overgeslagen: zelfde geld" : "Skipped: same money"}
                      <InfoTip label={nl ? "Welke regels hetzelfde geld zijn" : "Which rows are the same money"}>
                        <p>
                          {nl
                            ? "Regels die geen nieuwe transactie zijn, maar geld dat al uit een andere regel komt:"
                            : "Rows that are not a new transaction, but money that already comes from another row:"}
                        </p>
                        <ul className="list-disc space-y-1 pl-4">
                          <li>
                            {nl
                              ? "SumUp zet naast elke verkoop een regel \"Uitbetaling\" met hetzelfde bedrag. Die geeft enkel het nummer en de dag van de uitbetaling."
                              : "SumUp puts a \"Uitbetaling\" row with the same amount next to every sale. It only gives the payout's number and day."}
                          </li>
                          <li>
                            {nl
                              ? "Het balansrapport van Mollie noemt ook de betalingen, maar zonder hun uitbetaling: die komen uit de betalingenexport."
                              : "The Mollie balance report also lists the payments, but without their payout: those come from the payments export."}
                          </li>
                          <li>
                            {nl
                              ? "De maandfactuur van Mollie in het balansrapport, voor een maand waarvan de kosten al uit de export per uitbetaling komen (\"Withheld fees\"): dat is dezelfde kost."
                              : "The Mollie monthly invoice in the balance report, for a month whose fees already come from the export per payout (\"Withheld fees\"): that is the same fee."}
                          </li>
                        </ul>
                      </InfoTip>
                    </span>
                  }
                  value={number(totals.ignored)}
                />
              ) : null}
            </dl>
          </details>
          {totals.newChannels.length > 0 ? (
            <p className="mt-2 text-vtk-muted">
              {nl ? (totals.newChannels.length === 1 ? "Nieuw kanaal: " : "Nieuwe kanalen: ") : totals.newChannels.length === 1 ? "New channel: " : "New channels: "}
              {totals.newChannels.join(", ")}.{" "}
              {nl
                ? "Stel de rekening, en eventueel een standaardcode, in bij Instellingen."
                : "Set the account, and a default code if needed, under Settings."}
            </p>
          ) : null}
          {totals.mollieWithoutFees ? (
            <p className="mt-2 text-vtk-muted">
              {nl
                ? "Een Mollie-bestand heeft geen kosten- of reserveregels. De betalingen krijgen een code, maar het Mollie-totaal zal niet kloppen met de bank tot de kosten er ook in zitten: upload ook het balansrapport."
                : "A Mollie file has no fee or reserve rows. The payments get a code, but the Mollie total will not match the bank until the fees are in too: upload the balance report as well."}
            </p>
          ) : null}
          {totals.created + totals.updated + totals.payouts === 0 ? (
            <p className="mt-2 text-vtk-muted">
              {nl ? (several ? "Er is niets nieuws in deze bestanden." : "Er is niets nieuws in dit bestand.") : several ? "There is nothing new in these files." : "There is nothing new in this file."}
            </p>
          ) : null}
          {several ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-vtk-muted">{nl ? `Per bestand (${good.length})` : `Per file (${good.length})`}</summary>
              <div className="relative mt-2 max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-vtk-muted">
                      <th className="py-1 pr-3 font-medium">{nl ? "Bestand" : "File"}</th>
                      <th className="py-1 pr-3 font-medium">{nl ? "Bron" : "Source"}</th>
                      <th className="py-1 pr-3 font-medium">{nl ? "Periode" : "Period"}</th>
                      <th className="py-1 pr-3 text-right font-medium">{nl ? "Nieuw" : "New"}</th>
                      <th className="py-1 pr-3 text-right font-medium">{nl ? "Al gekend" : "Known"}</th>
                      <th className="py-1 text-right font-medium">{nl ? "Na te kijken" : "To review"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {good.map((summary) => (
                      <tr key={summary.fileName} className="border-t border-vtk-blue/8">
                        <td className="py-1 pr-3 break-all">{summary.fileName}</td>
                        <td className="py-1 pr-3">{SOURCE_LABELS[summary.source]}</td>
                        <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                          {summary.firstAt
                            ? day(summary.firstAt) === day(summary.lastAt)
                              ? day(summary.firstAt)
                              : `${day(summary.firstAt)} ${nl ? "tot" : "to"} ${day(summary.lastAt)}`
                            : ""}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">{number(summary.created)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{number(summary.duplicates)}</td>
                        <td className="py-1 text-right tabular-nums">{number(summary.rules.OPEN)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </SaveForm>
  );
}

function Stat({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-vtk-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
