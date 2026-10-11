"use client";

import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import {
  confirmPraesidiumShiftListAction,
  replacePraesidiumShiftListFileAction,
} from "@/app/actions/praesidiumShifts";

/** Een nieuwe export van dezelfde lijst opladen: de keuzes per naam blijven. */
export function ReplaceFileForm({
  locale,
  listId,
  fileName,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  fileName: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={replacePraesidiumShiftListFileAction}
      submitLabel={nl ? "Nieuwe versie inlezen" : "Read new version"}
      savingLabel={nl ? "Bezig met inlezen..." : "Reading..."}
      savedMessage={nl ? "Nieuwe versie ingelezen." : "New version read."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet ingelezen: er ging iets mis." : "Not read: something went wrong."}
      className="space-y-3"
    >
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm text-vtk-body">
        {nl
          ? `Nu ingelezen: ${fileName}. Vullen mensen de lijst verder aan, laad dan een nieuwe export op. De vakjes worden vervangen; de instellingen en de keuzes per naam blijven, dus je kijkt enkel de nieuwe namen na.`
          : `Currently read: ${fileName}. When people keep filling in the list, upload a new export. The cells are replaced; the settings and name choices stay, so you only review the new names.`}
      </p>
      <div className="max-w-md">
        <Label htmlFor="rf-file">{nl ? "Bestand (.xlsx)" : "File (.xlsx)"}</Label>
        <Input id="rf-file" type="file" name="file" accept=".xlsx" required />
      </div>
    </SaveForm>
  );
}

/** Een nagekeken lijst laten meetellen. */
export function ConfirmListForm({
  locale,
  listId,
  unresolved,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  unresolved: number;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={confirmPraesidiumShiftListAction}
      submitLabel={nl ? "Lijst bevestigen" : "Confirm list"}
      savingLabel={nl ? "Bezig..." : "Working..."}
      savedMessage={nl ? "Lijst bevestigd: ze telt nu mee." : "List confirmed: it counts now."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet bevestigd: er ging iets mis." : "Not confirmed: something went wrong."}
      confirmSubmit={
        unresolved > 0
          ? {
              title: nl ? "Bevestigen met open namen?" : "Confirm with open names?",
              description: nl
                ? `${unresolved} ${unresolved === 1 ? "naam wacht" : "namen wachten"} nog op een keuze. Hun shiften tellen voor niemand tot je ze koppelt; dat kan later nog.`
                : `${unresolved} names still wait for a choice. Their shifts count for nobody until you link them; you can still do that later.`,
              confirmLabel: nl ? "Toch bevestigen" : "Confirm anyway",
              cancelLabel: nl ? "Terug" : "Back",
            }
          : null
      }
    >
      <input type="hidden" name="listId" value={listId} />
    </SaveForm>
  );
}
