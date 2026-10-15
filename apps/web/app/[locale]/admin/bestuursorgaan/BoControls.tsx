"use client";

import { useTransition } from "react";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";
import {
  pairBoResultAction,
  saveBoPostAliasAction,
  saveBoSettingsAction,
  scanBestuursorgaanAction,
} from "@/app/actions/bestuursorgaan";

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
 * Een keuzelijst die bij elke wijziging meteen opslaat, zoals de bijnamen van
 * het shiftenoverzicht: een rij in "Na te kijken" is één beslissing, geen
 * formulier met een aparte opslaan-knop.
 */
function useSaveOnChange(
  action: SaveAction,
  locale: Locale,
  errorMessages: Record<string, string>,
  successMessage: string,
) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  function save(fields: Record<string, string>) {
    startTransition(async () => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      const result = await action(SAVE_IDLE, data);
      if (result.status === "error") {
        showToast({
          message:
            errorMessages[result.code] ?? result.detail ?? (nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: successMessage, variant: "success" });
    });
  }
  return { pending, save };
}

export type PostOption = { id: string; name: string };

/** "Vice" in de bestandsnamen is ... (een post kiezen). */
export function PostAliasSelect({
  locale,
  label,
  posts,
  errorMessages,
}: {
  locale: Locale;
  label: string;
  posts: PostOption[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const { pending, save } = useSaveOnChange(
    saveBoPostAliasAction,
    locale,
    errorMessages,
    nl ? `"${label}" gekoppeld; elk bestand met die naam volgt mee.` : `"${label}" linked; every file with that name follows.`,
  );
  return (
    <Select
      aria-label={nl ? `Welke post is "${label}"?` : `Which post is "${label}"?`}
      defaultValue=""
      disabled={pending}
      onChange={(event) => {
        if (event.target.value) save({ label, groupId: event.target.value });
      }}
      className="h-9 w-56 py-1 text-sm"
    >
      <option value="" disabled>
        {nl ? "Kies de post" : "Choose the post"}
      </option>
      {posts.map((post) => (
        <option key={post.id} value={post.id}>
          {post.name}
        </option>
      ))}
    </Select>
  );
}

export type BudgetOption = { id: string; label: string };

/** Een resultaat zonder budget bij een budget van dezelfde post zetten. */
export function PairBudgetSelect({
  locale,
  resultId,
  candidates,
  errorMessages,
}: {
  locale: Locale;
  resultId: string;
  candidates: BudgetOption[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const { pending, save } = useSaveOnChange(
    pairBoResultAction,
    locale,
    errorMessages,
    nl ? "Resultaat bij het budget gezet." : "Result linked to the budget.",
  );
  return (
    <Select
      aria-label={nl ? "Bij welk budget hoort dit resultaat?" : "Which budget does this result belong to?"}
      defaultValue=""
      disabled={pending}
      onChange={(event) => {
        if (event.target.value) save({ resultId, budgetId: event.target.value });
      }}
      className="h-9 w-64 py-1 text-sm"
    >
      <option value="" disabled>
        {nl ? "Kies het budget" : "Choose the budget"}
      </option>
      {candidates.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>
          {candidate.label}
        </option>
      ))}
    </Select>
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
