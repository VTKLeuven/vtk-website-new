"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { Label } from "@vtk/ui";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction } from "@/lib/saveState";
import type { CodeSuggestion } from "./AcceptForm";

/**
 * De boekhoudcode van een aanvaarde kassa, achteraf te wijzigen: wat er tijdens
 * de kassa op haar bakjes en rekeningen binnenkwam, krijgt die code in de
 * online inkomsten. Opslaan koppelt die opnieuw.
 */
export function CodeForm({
  locale,
  action,
  id,
  codes,
  value,
  suggestion,
  errorMessages,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  id: string;
  codes: AccountingCodeOption[];
  value: string | null;
  /** Een voorstel uit de gekoppelde ticketverkopen, voor een kassa zonder code. */
  suggestion: CodeSuggestion | null;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const uid = useId();
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Code opslaan" : "Save code"}
      submitVariant="ghost"
      submitSize="sm"
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Opgeslagen." : "Saved."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <div className="w-full max-w-md">
        <Label htmlFor={`${uid}-code`}>{nl ? "Boekhoudcode" : "Accounting code"}</Label>
        <AccountingCodePicker
          id={`${uid}-code`}
          codes={codes}
          name="accountingCodeId"
          defaultValue={value ?? suggestion?.id ?? null}
          locale={locale}
          noneLabel={nl ? "Nog geen code" : "No code yet"}
        />
        {!value && suggestion ? <p className="mt-1 text-xs text-vtk-muted">{suggestion.note}</p> : null}
      </div>
    </SaveForm>
  );
}
