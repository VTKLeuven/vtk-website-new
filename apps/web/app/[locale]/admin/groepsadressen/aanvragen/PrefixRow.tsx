"use client";

import { Input } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveMailPrefixAction } from "./actions";

export function PrefixRow({
  nl,
  groupId,
  name,
  prefix,
}: {
  nl: boolean;
  groupId: string;
  name: string;
  prefix: string | null;
}) {
  return (
    <li className="py-2">
      <SaveForm
        action={saveMailPrefixAction}
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Bezig..." : "Saving..."}
        savedMessage={nl ? `Voorvoegsel van ${name} opgeslagen.` : `Prefix of ${name} saved.`}
        submitSize="sm"
        submitVariant="ghost"
        resetOnSuccess={false}
        errorMessages={
          nl
            ? {
                INVALID_PREFIX: "Niet opgeslagen: enkel kleine letters en cijfers, zonder punt.",
                DUPLICATE_PREFIX: "Niet opgeslagen: een andere werkgroep heeft dat voorvoegsel al.",
              }
            : {
                INVALID_PREFIX: "Not saved: only lowercase letters and digits, without a dot.",
                DUPLICATE_PREFIX: "Not saved: another work group already has that prefix.",
              }
        }
        fallbackErrorMessage={nl ? "Opslaan is mislukt." : "Saving failed."}
        className="flex flex-wrap items-center gap-3"
      >
        <input type="hidden" name="groupId" value={groupId} />
        <span className="w-48 text-sm text-vtk-ink">{name}</span>
        <Input
          name="mailPrefix"
          defaultValue={prefix ?? ""}
          placeholder={nl ? "geen" : "none"}
          aria-label={nl ? `Voorvoegsel van ${name}` : `Prefix of ${name}`}
          className="w-40"
        />
      </SaveForm>
    </li>
  );
}
