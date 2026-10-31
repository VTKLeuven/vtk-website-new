"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useTransition } from "react";
import { Input, Label } from "@vtk/ui";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { savePraesidiumShiftAliasAction } from "@/app/actions/praesidiumShifts";

export type AliasOption = { userId: string; name: string; hint?: string };

function pickerOptions(options: AliasOption[], nl: boolean): SearchPickerOption[] {
  return [
    ...options.map((o) => ({ value: o.userId, label: o.name, hint: o.hint, group: nl ? "Praesidium" : "Praesidium" })),
    {
      value: "ignore",
      label: nl ? "Geen praesidium" : "Not praesidium",
      hint: nl ? "werkgroep, andere kring" : "werkgroep, other association",
      group: nl ? "Anders" : "Other",
      muted: true,
    },
    {
      value: "noname",
      label: nl ? "Geen naam" : "Not a name",
      hint: nl ? "een post, taak of opmerking" : "a post, task or note",
      group: nl ? "Anders" : "Other",
      muted: true,
    },
  ];
}

function pickerText(nl: boolean, label: string) {
  return {
    searchPlaceholder: nl ? "Typ een naam of post" : "Type a name or post",
    ariaLabel: nl ? `Wie is ${label}?` : `Who is ${label}?`,
    emptyText: (q: string) => (nl ? `Niemand in het praesidium past bij "${q}".` : `Nobody in the praesidium matches "${q}".`),
  };
}

/**
 * Wie een bijnaam is, meteen aanpasbaar: een andere keuze slaat op en geldt
 * vanaf dan op elke lijst waar die naam niet met de hand gekozen is.
 */
export function AliasTargetSelect({
  locale,
  label,
  value,
  options,
  errorMessages,
}: {
  locale: "nl" | "en";
  label: string;
  value: string;
  options: AliasOption[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function change(target: string) {
    startTransition(async () => {
      const data = new FormData();
      data.set("label", label);
      data.set("target", target);
      const result = await unsentGuard.run(() => savePraesidiumShiftAliasAction(SAVE_IDLE, data));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({
          message: errorMessages[result.code] ?? (nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl ? `"${label}" aangepast; de lijsten volgen mee.` : `"${label}" updated; the lists follow.`,
        variant: "success",
      });
    });
  }

  return (
    <SearchPicker
      defaultValue={value}
      disabled={pending}
      onChange={change}
      options={pickerOptions(options, nl)}
      placeholder={nl ? "Kies wie dit is" : "Choose who this is"}
      {...pickerText(nl, label)}
    />
  );
}

/** Een bijnaam toevoegen voor ze op een lijst opduikt. */
export function NewAliasForm({
  locale,
  options,
  errorMessages,
}: {
  locale: "nl" | "en";
  options: AliasOption[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={savePraesidiumShiftAliasAction}
      submitLabel={nl ? "Toevoegen" : "Add"}
      savingLabel={nl ? "Bezig..." : "Working..."}
      savedMessage={nl ? "Bijnaam toegevoegd." : "Nickname added."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="w-48">
        <Label htmlFor="alias-label">{nl ? "Bijnaam" : "Nickname"}</Label>
        <Input id="alias-label" name="label" required maxLength={80} placeholder="Mekkie" />
      </div>
      <div className="w-72">
        <Label htmlFor="alias-target">{nl ? "Is" : "Is"}</Label>
        <SearchPicker
          id="alias-target"
          name="target"
          options={pickerOptions(options, nl)}
          placeholder={nl ? "Kies een praesidiumlid" : "Choose a praesidium member"}
          {...pickerText(nl, nl ? "deze bijnaam" : "this nickname")}
        />
      </div>
    </SaveForm>
  );
}
