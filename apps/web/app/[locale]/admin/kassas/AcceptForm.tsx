"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Label, Select } from "@vtk/ui";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import { formatEuro } from "@/lib/rekeningen/expenses";
import type { Counts, PaymentMethod } from "@/lib/kassas/kassa";
import { countInputsFrom, DenominationGrid, inputsTotalCents } from "./DenominationGrid";

/** Een bakje of rekening uit de instellingen, en bij wie het dan al ligt. */
export type DeviceOption = { name: string; busyWith: string | null };

/**
 * Een voorstel voor de code van de kassa, uit de gekoppelde ticketverkopen.
 * `id` is null wanneer die verschillende codes hebben: dan staat er niets
 * ingevuld, enkel welke codes ze hebben.
 */
export type CodeSuggestion = { id: string | null; note: string };

/**
 * Aanvaarden, zoals Beheer het doet: de startkassa staat er al met het
 * standaardwisselgeld voor wat de post aanduidde, Beheer past het exacte aantal
 * aan, kiest het Bancontact-bakje en de Payconiq-rekening, en aanvaardt. De mail
 * toont wat hier staat.
 *
 * Een toestel dat op dat moment al bij een andere activiteit ligt, staat
 * uitgegrijsd met de naam van die activiteit; de action weigert het ook.
 *
 * Krijgt de kassa een toestel, dan kiest Beheer ook de boekhoudcode: wat er
 * op haar bakje of rekening binnenkomt, krijgt die code in de online
 * inkomsten. De post kiest ze niet.
 */
export function AcceptForm({
  locale,
  base,
  action,
  id,
  startCounts,
  bancontact,
  payconiq,
  codes,
  suggestion,
  confirmDescription,
  errorMessages,
}: {
  locale: "nl" | "en";
  base: string;
  action: SaveAction;
  id: string;
  startCounts: Counts;
  /** `null` = de post vroeg er geen. */
  bancontact: DeviceOption[] | null;
  payconiq: DeviceOption[] | null;
  codes: AccountingCodeOption[];
  suggestion: CodeSuggestion | null;
  confirmDescription: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const uid = useId();
  const [start, setStart] = useState(() => countInputsFrom(startCounts, true));

  function devicePicker(method: PaymentMethod, options: DeviceOption[]) {
    const isBancontact = method === "BANCONTACT";
    const selectId = `${uid}-${method}`;
    const free = options.filter((option) => !option.busyWith);
    return (
      <div>
        <Label htmlFor={selectId}>{isBancontact ? (nl ? "Bancontact-bakje" : "Bancontact terminal") : nl ? "Payconiq-rekening" : "Payconiq account"}</Label>
        {options.length === 0 ? (
          <p className="mt-1 text-sm text-vtk-muted">
            {isBancontact
              ? nl
                ? "Er staan geen Bancontact-bakjes in de "
                : "There are no Bancontact terminals in the "
              : nl
                ? "Er staan geen Payconiq-rekeningen in de "
                : "There are no Payconiq accounts in the "}
            <Link href={`${base}/admin/kassas/instellingen`} className="underline underline-offset-4">
              {nl ? "instellingen" : "settings"}
            </Link>
            .
          </p>
        ) : (
          <>
            <Select
              id={selectId}
              name={isBancontact ? "bancontactTerminal" : "payconiqAccount"}
              required
              defaultValue=""
            >
              <option value="" disabled>
                {isBancontact ? (nl ? "Kies een bakje" : "Choose a terminal") : nl ? "Kies een rekening" : "Choose an account"}
              </option>
              {options.map((option) => (
                <option key={option.name} value={option.name} disabled={Boolean(option.busyWith)}>
                  {option.busyWith ? `${option.name} (${nl ? "bij" : "with"} ${option.busyWith})` : option.name}
                </option>
              ))}
            </Select>
            {free.length < options.length && (
              <p className="mt-1 text-xs text-vtk-muted">
                {free.length === 0
                  ? nl
                    ? "Ze liggen op dat moment allemaal al bij een andere activiteit."
                    : "They are all with another activity at that time."
                  : nl
                    ? "Uitgegrijsd: ligt op dat moment al bij een andere activiteit."
                    : "Greyed out: already with another activity at that time."}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Aanvaarden en mailen" : "Accept and email"}
      savingLabel={nl ? "Bezig met aanvaarden..." : "Accepting..."}
      savedMessage={nl ? "Aanvaard." : "Accepted."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Aanvaarden mislukt." : "Could not accept."}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      confirmSubmit={{
        title: nl ? "Aanvaarden en mailen?" : "Accept and send the email?",
        description: confirmDescription,
        confirmLabel: nl ? "Aanvaarden" : "Accept",
        cancelLabel: nl ? "Annuleren" : "Cancel",
      }}
      className="mt-4 space-y-6"
    >
      <input type="hidden" name="id" value={id} />

      <fieldset>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <legend className="text-sm font-medium text-vtk-ink">{nl ? "Startkassa" : "Starting float"}</legend>
          <span className="text-sm text-vtk-body">
            {nl ? "Totaal" : "Total"}{" "}
            <strong className="tabular-nums text-vtk-ink">{formatEuro(inputsTotalCents(start), locale)}</strong>
          </span>
        </div>
        <p className="mb-3 mt-1 text-xs text-vtk-muted">
          {nl
            ? "Het standaardwisselgeld voor wat de post aanduidde. Pas aan wat je anders meegeeft; de mail toont wat hier staat."
            : "The standard change for what the post ticked. Adjust what you hand out differently; the email shows what is here."}
        </p>
        <DenominationGrid
          locale={locale}
          prefix="start_"
          idPrefix={`${uid}-start`}
          values={start}
          onChange={setStart}
        />
      </fieldset>

      {(bancontact || payconiq) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {bancontact && devicePicker("BANCONTACT", bancontact)}
          {payconiq && devicePicker("PAYCONIQ", payconiq)}
        </div>
      )}

      {(bancontact || payconiq) && (
        <div className="max-w-md">
          <Label htmlFor={`${uid}-code`}>{nl ? "Boekhoudcode" : "Accounting code"}</Label>
          <AccountingCodePicker
            id={`${uid}-code`}
            codes={codes}
            name="accountingCodeId"
            defaultValue={suggestion?.id ?? null}
            locale={locale}
            noneLabel={nl ? "Nog geen code" : "No code yet"}
          />
          <p className="mt-1 text-xs text-vtk-muted">
            {nl
              ? "Wat er tijdens deze kassa op haar bakje of rekening binnenkomt, krijgt deze code in de online inkomsten."
              : "What comes in on its terminal or account during this register gets this code in the online income."}
          </p>
          {suggestion ? <p className="mt-1 text-xs text-vtk-muted">{suggestion.note}</p> : null}
        </div>
      )}
    </SaveForm>
  );
}
