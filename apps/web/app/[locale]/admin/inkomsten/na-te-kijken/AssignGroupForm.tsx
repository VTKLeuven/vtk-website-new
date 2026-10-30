"use client";

import { useRouter } from "next/navigation";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction } from "@/lib/saveState";

/**
 * Eén groep van Na te kijken een code geven, of laten wegvallen. Onthouden kan
 * enkel bij een vaste tekst (een groep "per tekst"); dan geldt de keuze ook
 * voor elke volgende transactie met die tekst.
 */
export function AssignGroupForm({
  groupKey,
  canRemember,
  codes,
  locale,
  action,
  errorMessages,
}: {
  groupKey: string;
  canRemember: boolean;
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  action: SaveAction;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Toewijzen" : "Assign"}
      submitSize="sm"
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegewezen." : "Assigned."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Toewijzen mislukt." : "Could not assign."}
      secondarySubmit={{ name: "intent", value: "exclude", label: nl ? "Telt niet mee" : "Does not count" }}
      onSuccess={() => router.refresh()}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="key" value={groupKey} />
      <div className="min-w-[16rem] flex-1">
        <AccountingCodePicker codes={codes} name="accountingCodeId" locale={locale} />
      </div>
      {canRemember ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remember" className="h-4 w-4" />
          {nl ? "Ook voor volgende met deze tekst" : "Also for later ones with this text"}
        </label>
      ) : null}
    </SaveForm>
  );
}
