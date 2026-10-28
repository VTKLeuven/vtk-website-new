"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileField } from "@/components/ui/FileField";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import type { ImportPreviewState } from "@/app/actions/inkomsten";
import { SOURCE_LABELS } from "../shared";

/**
 * Een export kiezen of slepen, eerst zien wat opladen zou doen, en pas dan
 * bewaren. De voorvertoning en het opladen rekenen op dezelfde manier
 * (`importIncomeExport`), dus wat hier staat, is wat er gebeurt.
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

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      setPreview({ status: "idle" });
      return;
    }
    const form = new FormData();
    form.append("file", file);
    startTransition(async () => setPreview(await previewAction(form)));
  }

  const summary = preview.status === "preview" ? preview.summary : null;

  return (
    <SaveForm
      action={importAction}
      submitLabel={nl ? "Opladen" : "Upload"}
      savingLabel={nl ? "Bezig met opladen..." : "Uploading..."}
      savedMessage={nl ? "Opgeladen." : "Uploaded."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opladen mislukt." : "Upload failed."}
      submitDisabled={pending || !summary || summary.created + summary.updated === 0}
      onSuccess={() => {
        setPreview({ status: "idle" });
        router.refresh();
      }}
      className="space-y-4"
    >
      <FileField
        name="file"
        accept=".csv,text/csv"
        required
        locale={locale}
        chooseLabel={nl ? "Export kiezen" : "Choose export"}
        hint={
          nl
            ? "Een CSV van Payconiq, de export van Mollie, de transacties van een SumUp-account of van een Europabank-terminal. Je kan het bestand ook hierheen slepen."
            : "A Payconiq CSV, the Mollie export, or the transactions of a SumUp account or a Europabank terminal. You can also drag the file here."
        }
        onChange={onFiles}
      />

      {pending ? <p className="text-sm text-vtk-muted">{nl ? "Bestand lezen..." : "Reading file..."}</p> : null}

      {preview.status === "error" ? (
        <p className="rounded-xl border border-vtk-danger-line bg-vtk-danger-soft px-4 py-3 text-sm text-vtk-danger" role="alert">
          {errorMessages[preview.code] ?? (nl ? "Dat bestand kan de site niet lezen." : "The site cannot read that file.")}
          {preview.detail ? ` (${preview.detail})` : ""}
        </p>
      ) : null}

      {summary && !pending ? (
        <div className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 px-4 py-3 text-sm">
          <p className="font-medium">
            {SOURCE_LABELS[summary.source]}
            {summary.firstAt ? ` · ${day(summary.firstAt)} ${nl ? "tot" : "to"} ${day(summary.lastAt)}` : ""}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            <Stat label={nl ? "Regels in het bestand" : "Rows in the file"} value={number(summary.total)} />
            <Stat label={nl ? "Nieuw" : "New"} value={number(summary.created)} />
            <Stat label={nl ? "Al eerder opgeladen" : "Already uploaded"} value={number(summary.duplicates)} />
            {summary.updated ? <Stat label={nl ? "Nu uitbetaald" : "Now paid out"} value={number(summary.updated)} /> : null}
            <Stat label={nl ? "Telt niet mee (mislukt, vervallen, geweigerd)" : "Does not count (failed, expired, denied)"} value={number(summary.skipped)} />
            {summary.ignored ? (
              <Stat label={nl ? "Uitbetalingsregels (zelfde geld)" : "Payout rows (same money)"} value={number(summary.ignored)} />
            ) : null}
            {summary.locked ? <Stat label={nl ? "In een afgesloten periode" : "In a closed period"} value={number(summary.locked)} /> : null}
            <Stat label={nl ? "Betaling van de site" : "Payment from the site"} value={number(summary.rules.WEBSITE)} />
            <Stat label={nl ? "Code in de tekst" : "Code in the text"} value={number(summary.rules.CODE_IN_TEXT)} />
            <Stat label={nl ? "Onthouden tekst" : "Remembered text"} value={number(summary.rules.NAME_RULE)} />
            {summary.rules.CHANNEL_DEFAULT ? (
              <Stat label={nl ? "Standaardcode van het kanaal" : "Default code of the channel"} value={number(summary.rules.CHANNEL_DEFAULT)} />
            ) : null}
            <Stat label={nl ? "Na te kijken" : "To review"} value={number(summary.rules.OPEN)} />
            {summary.feeRows ? <Stat label={nl ? "Kosten en reserve" : "Fees and reserve"} value={number(summary.feeRows)} /> : null}
          </dl>
          {summary.newChannels.length > 0 ? (
            <p className="mt-2 text-vtk-muted">
              {nl ? "Nieuw kanaal: " : "New channel: "}
              {summary.newChannels.join(", ")}.{" "}
              {nl
                ? "Stel de rekening, en eventueel een standaardcode, in bij Instellingen."
                : "Set its account, and a default code if needed, under Settings."}
            </p>
          ) : null}
          {summary.format === "mollie" && summary.feeRows === 0 && summary.created > 0 ? (
            <p className="mt-2 text-vtk-muted">
              {nl
                ? "Dit bestand heeft geen kosten- of reserveregels. De betalingen krijgen een code, maar het Mollie-totaal zal niet kloppen met de bank tot de kosten er ook in zitten."
                : "This file has no fee or reserve rows. The payments get a code, but the Mollie total will not match the bank until the fees are in too."}
            </p>
          ) : null}
          {summary.created + summary.updated === 0 ? (
            <p className="mt-2 text-vtk-muted">{nl ? "Er is niets nieuws in dit bestand." : "There is nothing new in this file."}</p>
          ) : null}
        </div>
      ) : null}
    </SaveForm>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-vtk-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
