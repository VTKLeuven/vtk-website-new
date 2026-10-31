"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileField } from "@/components/ui/FileField";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import type { AccountingCodesPreviewState } from "@/app/actions/accountingCodes";

/**
 * De lijst van de penning als CSV opladen. Eerst zie je wat er zou gebeuren
 * (nieuw, hernoemd, niet meer in het bestand, fouten); opladen bewaart
 * precies dat. Een code die niet in het bestand staat, blijft altijd staan.
 */
export function CodesUploadForm({
  locale,
  previewAction,
  importAction,
}: {
  locale: "nl" | "en";
  previewAction: (formData: FormData) => Promise<AccountingCodesPreviewState>;
  importAction: SaveAction;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const [preview, setPreview] = useState<AccountingCodesPreviewState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const errorMessages: Record<string, string> = nl
    ? {
        NO_FILE: "Kies eerst een bestand.",
        FILE_TOO_LARGE: "Dat bestand is groter dan 1 MB; een lijst met codes is veel kleiner.",
        EMPTY: "Dat bestand heeft geen regels.",
        COLUMNS:
          "De kolommen zijn niet herkend. De eerste rij moet een kolom \"Boekhoudcode\" (of \"Code\") en \"Naam\" (of \"Omschrijving\") hebben, en optioneel \"Subcode\" (of \"Analytische code\").",
      }
    : {
        NO_FILE: "Choose a file first.",
        FILE_TOO_LARGE: "That file is larger than 1 MB; a list of codes is much smaller.",
        EMPTY: "That file has no rows.",
        COLUMNS:
          "The columns were not recognised. The first row needs a column \"Boekhoudcode\" (or \"Code\") and \"Naam\" (or \"Omschrijving\"), and optionally \"Subcode\" (or \"Analytische code\").",
      };

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      setPreview({ status: "idle" });
      return;
    }
    const form = new FormData();
    form.append("file", file);
    startTransition(async () => {
      const result = await unsentGuard.run(() => previewAction(form));
      if (result !== UNSENT) setPreview(result);
    });
  }

  const plan = preview.status === "preview" ? preview.plan : null;
  // Een deel van de lijst zonder nieuwe of hernoemde codes verandert niets: dan valt er niets op te laden.
  const nothingToDo = plan !== null && plan.create.length === 0 && plan.rename.length === 0 && !plan.reorder;

  return (
    <SaveForm
      action={importAction}
      submitLabel={nl ? "Lijst uploaden" : "Upload list"}
      savingLabel={nl ? "Bezig met uploaden..." : "Uploading..."}
      savedMessage={nl ? "Geüpload." : "Uploaded."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Uploaden mislukt." : "Upload failed."}
      submitDisabled={pending || !plan || plan.errors.length > 0 || nothingToDo}
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
        chooseLabel={nl ? "Lijst kiezen" : "Choose list"}
        hint={
          nl
            ? "Een CSV met de kolommen Boekhoudcode, Subcode (optioneel) en Naam, bv. het rekenblad van de penning als CSV gedownload."
            : "A CSV with the columns Boekhoudcode, Subcode (optional) and Naam, e.g. the treasurer's spreadsheet downloaded as CSV."
        }
        onChange={onFiles}
      />

      {pending ? <p className="text-sm text-vtk-muted">{nl ? "Bestand lezen..." : "Reading file..."}</p> : null}

      {preview.status === "error" ? (
        <p className="rounded-xl border border-vtk-danger-line bg-vtk-danger-soft px-4 py-3 text-sm text-vtk-danger" role="alert">
          {errorMessages[preview.code] ?? (nl ? "Dat bestand kan de site niet lezen." : "The site cannot read that file.")}
        </p>
      ) : null}

      {plan && !pending ? (
        <div className="space-y-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 px-4 py-3 text-sm">
          <p className="font-medium">
            {nl
              ? `${plan.create.length} nieuw, ${plan.rename.length} hernoemd, ${plan.unchanged} ongewijzigd.`
              : `${plan.create.length} new, ${plan.rename.length} renamed, ${plan.unchanged} unchanged.`}{" "}
            {plan.reorder
              ? nl
                ? "Het bestand bevat de hele lijst: de volgorde van het register wordt die van het bestand."
                : "The file has the whole list: the register takes the order of the file."
              : nl
                ? "Het bestand bevat niet de hele lijst: de volgorde blijft, en nieuwe codes komen achteraan bij hun hoofdrekening."
                : "The file does not have the whole list: the order stays, and new codes go last under their main account."}
          </p>
          {plan.errors.length > 0 ? (
            <div className="text-vtk-danger" role="alert">
              <p className="font-medium">
                {nl ? "Er wordt niets geüpload tot deze regels kloppen:" : "Nothing is uploaded until these rows are right:"}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {plan.errors.slice(0, 10).map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    {nl ? "Regel" : "Row"} {error.line}: {error.message}
                  </li>
                ))}
              </ul>
              {plan.errors.length > 10 ? <p>{nl ? `En nog ${plan.errors.length - 10}.` : `And ${plan.errors.length - 10} more.`}</p> : null}
            </div>
          ) : null}
          {plan.create.length > 0 ? (
            <details>
              <summary className="cursor-pointer">{nl ? "Nieuwe codes" : "New codes"}</summary>
              <ul className="mt-1 columns-2 tabular-nums">
                {plan.create.map((code) => (
                  <li key={code.code}>
                    {code.code} {code.name}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {plan.rename.length > 0 ? (
            <details>
              <summary className="cursor-pointer">{nl ? "Hernoemd" : "Renamed"}</summary>
              <ul className="mt-1">
                {plan.rename.map((code) => (
                  <li key={code.code}>
                    <span className="tabular-nums">{code.code}</span>: {code.from} {nl ? "wordt" : "becomes"} {code.to}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {plan.missing.length > 0 ? (
            <p className="text-vtk-muted">
              {nl
                ? `${plan.missing.length} codes staan in het register maar niet in het bestand. Die blijven staan; verwijder ze in de lijst hieronder als ze echt weg moeten.`
                : `${plan.missing.length} codes are in the register but not in the file. They stay; delete them in the list below if they really have to go.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </SaveForm>
  );
}
