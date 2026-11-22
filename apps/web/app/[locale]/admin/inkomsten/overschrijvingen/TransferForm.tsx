"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, Select } from "@vtk/ui";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction } from "@/lib/saveState";

export type TransferDefaults = {
  id: string;
  day: string;
  /** Zoals in het veld: "12,50" of "-12,50". */
  amount: string;
  bankAccount: string;
  accountingCodeId: string | null;
  description: string;
};

/** Een overschrijving toevoegen (zonder `transfer`) of aanpassen (in de modal van de lijst). */
export function TransferForm({
  accounts,
  codes,
  locale,
  action,
  errorMessages,
  transfer,
  onSaved,
}: {
  accounts: string[];
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  action: SaveAction;
  errorMessages: Record<string, string>;
  transfer?: TransferDefaults;
  onSaved?: () => void;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const uid = useId();
  // Na een nieuwe overschrijving een vers formulier, ook de codekiezer (die
  // houdt zijn waarde in eigen state). De rekening blijft niet staan: een
  // volgende storting kan op een andere rekening zijn.
  const [round, setRound] = useState(0);
  // Een rekening die niet meer in Instellingen staat, blijft kiesbaar bij aanpassen.
  const options = transfer && !accounts.includes(transfer.bankAccount) ? [...accounts, transfer.bankAccount] : accounts;
  return (
    <SaveForm
      key={round}
      action={action}
      submitLabel={transfer ? (nl ? "Opslaan" : "Save") : nl ? "Toevoegen" : "Add"}
      submitSize="sm"
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Opgeslagen." : "Saved."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
      resetOnSuccess={false}
      onSuccess={() => {
        if (!transfer) setRound((current) => current + 1);
        router.refresh();
        onSaved?.();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      {transfer ? <input type="hidden" name="id" value={transfer.id} /> : null}
      <div>
        <Label htmlFor={`${uid}-day`}>{nl ? "Dag" : "Day"}</Label>
        <Input id={`${uid}-day`} type="date" name="day" required defaultValue={transfer?.day ?? ""} className="w-auto" />
      </div>
      <div className="w-32">
        <Label htmlFor={`${uid}-amount`}>{nl ? "Bedrag" : "Amount"}</Label>
        <Input
          id={`${uid}-amount`}
          name="amount"
          inputMode="decimal"
          required
          placeholder="12,50"
          defaultValue={transfer?.amount ?? ""}
          aria-describedby={`${uid}-amount-hint`}
          className="tabular-nums"
        />
        <span id={`${uid}-amount-hint`} className="sr-only">
          {nl ? "In euro. Een terugbetaling met een min ervoor." : "In euro. A refund with a minus in front."}
        </span>
      </div>
      <div className="w-64">
        <Label htmlFor={`${uid}-account`}>{nl ? "Rekening" : "Account"}</Label>
        <Select id={`${uid}-account`} name="bankAccount" required defaultValue={transfer?.bankAccount ?? ""}>
          <option value="" disabled>
            {nl ? "Kies een rekening" : "Choose an account"}
          </option>
          {options.map((account) => (
            <option key={account} value={account}>
              {account}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`${uid}-code`}>{nl ? "Boekhoudcode" : "Accounting code"}</Label>
        <AccountingCodePicker
          id={`${uid}-code`}
          codes={codes}
          name="accountingCodeId"
          locale={locale}
          required
          defaultValue={transfer?.accountingCodeId ?? null}
        />
      </div>
      <div className="w-full">
        <Label htmlFor={`${uid}-description`}>{nl ? "Omschrijving" : "Description"}</Label>
        <Input
          id={`${uid}-description`}
          name="description"
          maxLength={200}
          defaultValue={transfer?.description ?? ""}
          placeholder={nl ? "waarvoor, bv. inschrijving galabal" : "what for, e.g. gala registration"}
        />
      </div>
    </SaveForm>
  );
}
