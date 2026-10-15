"use client";

import { useTransition } from "react";
import { Input, Label } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { EyeIcon } from "@/components/ui/icons";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import { restoreBoDocumentAction, saveBoSettingsAction, scanBestuursorgaanAction } from "@/app/actions/bestuursorgaan";

type Locale = "nl" | "en";

/** De BO-map nu lezen. De uitkomst (hoeveel bestanden) komt als toast. */
export function ScanButton({ locale, errorMessages }: { locale: Locale; errorMessages: Record<string, string> }) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={scanBestuursorgaanAction}
      submitLabel={nl ? "Nu lezen" : "Read now"}
      savingLabel={nl ? "Bezig met lezen..." : "Reading..."}
      savedMessage={nl ? "De BO-map is gelezen." : "The board folder has been read."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Lezen mislukt." : "Reading failed."}
      submitVariant="ghost"
      submitSize="sm"
      resetOnSuccess={false}
    >
      <input type="hidden" name="locale" value={locale} />
    </SaveForm>
  );
}

/**
 * Een bestand dat niet meetelde, weer laten meetellen. Zonder bevestiging: er
 * gaat niets verloren, en "Niet meetellen" zet het zo terug weg.
 */
export function RestoreFileButton({
  docId,
  name,
  locale,
  errorMessages,
}: {
  docId: string;
  name: string;
  locale: Locale;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  return (
    <IconButton
      label={nl ? "Weer meetellen" : "Count again"}
      srLabel={nl ? `Weer meetellen: ${name}` : `Count again: ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = new FormData();
          data.set("docId", docId);
          const result = await restoreBoDocumentAction(data);
          if (result.status === "error") {
            showToast({
              message: errorMessages[result.code] ?? (nl ? "Niet teruggezet: er ging iets mis." : "Not restored: something went wrong."),
              variant: "error",
              duration: 0,
            });
            return;
          }
          showToast({ message: nl ? `"${name}" telt weer mee.` : `"${name}" counts again.`, variant: "success" });
        })
      }
    >
      <EyeIcon />
    </IconButton>
  );
}

/** Waar de BO-map staat. */
export function BoSettingsForm({
  locale,
  year,
  root,
  yearFolder,
  errorMessages,
}: {
  locale: Locale;
  /** Het werkingsjaar als "26-27". */
  year: string;
  root: string;
  yearFolder: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={saveBoSettingsAction}
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Opslaan..." : "Saving..."}
      savedMessage={nl ? "Opgeslagen. Klik op Nu lezen om de map meteen te lezen." : "Saved. Click Read now to read the folder right away."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={false}
      className="grid gap-4"
    >
      <div>
        <Label htmlFor="bo-root">{nl ? "Gedeelde drive Praesidium" : "Shared drive Praesidium"}</Label>
        <Input
          id="bo-root"
          name="root"
          defaultValue={root}
          placeholder="https://drive.google.com/drive/folders/..."
        />
        <p className="mt-1 text-xs text-vtk-muted">
          {nl
            ? 'De link naar de drive (of de map) waarin de jaarmappen staan. De site zoekt daarin zelf "2026 - 2027 ..." en daarin "Bestuursorgaan", dus op 15 juli hoeft hier niets te veranderen.'
            : 'The link to the drive (or folder) holding the year folders. The site looks for "2026 - 2027 ..." and "Bestuursorgaan" inside it by itself, so nothing needs to change here on 15 July.'}
        </p>
      </div>
      <div>
        <Label htmlFor="bo-year">{nl ? `Map Bestuursorgaan ${year} (optioneel)` : `Board folder ${year} (optional)`}</Label>
        <Input
          id="bo-year"
          name="yearFolder"
          defaultValue={yearFolder}
          placeholder="https://drive.google.com/drive/folders/..."
        />
        <p className="mt-1 text-xs text-vtk-muted">
          {nl
            ? "Enkel nodig wanneer de jaarmap anders heet en de site ze dus niet vindt."
            : "Only needed when the year folder is named differently and the site cannot find it."}
        </p>
      </div>
    </SaveForm>
  );
}
