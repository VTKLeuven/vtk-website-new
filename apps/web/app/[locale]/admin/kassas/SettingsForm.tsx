"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Input, Label } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { amountInputValue, MAX_TERMINAL_NAME, MAX_TERMINALS, type CashRegisterConfig } from "@/lib/kassas/kassa";

type Entry = { key: string; name: string };

/**
 * De bakjes en rekeningen, de waarde van een bon en het adres van Beheer.
 * Hernoemen of schrappen raakt geen kassa die al een bakje heeft: die houdt de
 * naam die ze had (zie `CashRegisterPayment.terminal`).
 */
export function SettingsForm({
  locale,
  action,
  config,
  errorMessages,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  config: CashRegisterConfig;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();

  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Instellingen opslaan" : "Save settings"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Instellingen opgeslagen." : "Settings saved."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <NameList
          locale={locale}
          name="bancontact"
          title={nl ? "Bancontact-bakjes" : "Bancontact terminals"}
          addLabel={nl ? "Bakje toevoegen" : "Add terminal"}
          initial={config.bancontactTerminals}
        />
        <NameList
          locale={locale}
          name="payconiq"
          title={nl ? "Payconiq-rekeningen" : "Payconiq accounts"}
          addLabel={nl ? "Rekening toevoegen" : "Add account"}
          initial={config.payconiqAccounts}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="shiftVoucherValue">{nl ? "Waarde shiftersbon" : "Shift voucher value"}</Label>
          <Input
            id="shiftVoucherValue"
            name="shiftVoucherValue"
            inputMode="decimal"
            defaultValue={amountInputValue(config.shiftVoucherValueCents)}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="elixirVoucherValue">{nl ? "Waarde elixirbon" : "Elixir voucher value"}</Label>
          <Input
            id="elixirVoucherValue"
            name="elixirVoucherValue"
            inputMode="decimal"
            defaultValue={amountInputValue(config.elixirVoucherValueCents)}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="contactEmail">{nl ? "Adres van Beheer" : "Administration address"}</Label>
          <Input id="contactEmail" name="contactEmail" type="email" required defaultValue={config.contactEmail} />
        </div>
      </div>
      <p className="text-xs text-vtk-muted">
        {nl
          ? "De waarde van een bon telt mee in het finaal resultaat; zet ze op 0 om bonnen enkel te tellen. Een nieuwe waarde geldt voor kassa's die vanaf nu aangevraagd worden, niet voor bestaande. Het adres staat in de mail bij het aanvaarden en krijgt de antwoorden."
          : "A voucher's value counts in the final result; set it to 0 to only count vouchers. A new value applies to registers requested from now on, not to existing ones. The address is in the acceptance email and receives the replies."}
      </p>
    </SaveForm>
  );
}

function NameList({
  locale,
  name,
  title,
  addLabel,
  initial,
}: {
  locale: "nl" | "en";
  name: string;
  title: string;
  addLabel: string;
  initial: string[];
}) {
  const nl = locale === "nl";
  const uid = useId();
  const [entries, setEntries] = useState<Entry[]>(() =>
    initial.map((entry, index) => ({ key: `initial-${index}`, name: entry })),
  );
  const [next, setNext] = useState(0);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-vtk-ink">{title}</legend>
      {entries.length === 0 && (
        <p className="text-sm text-vtk-muted">{nl ? "Nog geen." : "None yet."}</p>
      )}
      {entries.map((entry, index) => (
        <div key={entry.key} className="flex items-center gap-2">
          <label htmlFor={`${uid}-${entry.key}`} className="sr-only">
            {`${title} ${index + 1}`}
          </label>
          <Input
            id={`${uid}-${entry.key}`}
            name={name}
            value={entry.name}
            maxLength={MAX_TERMINAL_NAME}
            onChange={(event) =>
              setEntries((current) =>
                current.map((candidate) =>
                  candidate.key === entry.key ? { ...candidate, name: event.target.value } : candidate,
                ),
              )
            }
          />
          <IconButton
            label={nl ? "Weghalen" : "Remove"}
            srLabel={`${nl ? "Weghalen" : "Remove"}: ${entry.name || title}`}
            tone="danger"
            onClick={() => setEntries((current) => current.filter((candidate) => candidate.key !== entry.key))}
          >
            <TrashIcon />
          </IconButton>
        </div>
      ))}
      {entries.length < MAX_TERMINALS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setEntries((current) => [...current, { key: `added-${next}`, name: "" }]);
            setNext((value) => value + 1);
          }}
        >
          {addLabel}
        </Button>
      )}
    </fieldset>
  );
}
