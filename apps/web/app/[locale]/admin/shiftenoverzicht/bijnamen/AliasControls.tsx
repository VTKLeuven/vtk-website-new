"use client";

import { useTransition } from "react";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { savePraesidiumShiftAliasAction } from "@/app/actions/praesidiumShifts";

export type AliasOption = { userId: string; label: string };

function Options({ options, nl }: { options: AliasOption[]; nl: boolean }) {
  return (
    <>
      {options.map((o) => (
        <option key={o.userId} value={o.userId}>
          {o.label}
        </option>
      ))}
      <option value="ignore">{nl ? "Geen praesidium (negeren)" : "Not praesidium (ignore)"}</option>
    </>
  );
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
      const result = await savePraesidiumShiftAliasAction(SAVE_IDLE, data);
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
    <select
      defaultValue={value}
      disabled={pending}
      onChange={(e) => change(e.currentTarget.value)}
      aria-label={nl ? `Wie is ${label}?` : `Who is ${label}?`}
      className="w-full min-w-48 rounded-xl border border-vtk-blue/15 bg-white px-2.5 py-1.5 text-sm disabled:opacity-60"
    >
      <Options options={options} nl={nl} />
    </select>
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
        <Select id="alias-target" name="target" required defaultValue="">
          <option value="" disabled>
            {nl ? "Kies een praesidiumlid" : "Choose a praesidium member"}
          </option>
          <Options options={options} nl={nl} />
        </Select>
      </div>
    </SaveForm>
  );
}
