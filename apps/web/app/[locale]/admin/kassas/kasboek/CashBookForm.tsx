"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { cashBookKindLabel, needsInvoice, type CashBookKind } from "@/lib/kassas/cashBook";
import { ReceiptField } from "../../rekeningen/ReceiptField";

export type CashBookFormValues = {
  /** Leeg bij een nieuwe regel. */
  id?: string;
  kind: CashBookKind;
  /** "YYYY-MM-DD". */
  date: string;
  /** Zoals in het veld, bv. "125,50". */
  amount: string;
  description: string;
  note: string;
  /** De factuur die er nu aan hangt, bij aanpassen. */
  invoice?: { key: string; name: string; mime: string; size: number; previewUrl: string };
};

/**
 * Eén regel in het kasboek van Beheer. De soort kies je met de knop die het
 * formulier opende (nieuw) of in het formulier zelf (aanpassen). Bij een
 * aankoop is de factuur verplicht, en dat zegt het veld ook.
 */
export function CashBookForm({
  locale,
  action,
  values,
  maxDate,
  errorMessages,
  kindEditable = false,
  onCancel,
  onSaved,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  values: CashBookFormValues;
  maxDate: string;
  errorMessages: Record<string, string>;
  /** Mag de soort hier nog veranderen? Bij aanpassen wel. */
  kindEditable?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const nl = locale === "nl";
  const uid = useId();
  const router = useRouter();
  const isEdit = Boolean(values.id);
  const [kind, setKind] = useState<CashBookKind>(values.kind);
  const invoiceRequired = needsInvoice(kind);

  const descriptionHint = {
    DEPOSIT: nl ? "Bv. de opbrengst van de kassa's van de cantus" : "E.g. the takings of the cantus registers",
    WITHDRAWAL: nl ? "Bv. wisselgeld voor de onthaaldagen" : "E.g. change for the welcome days",
    PURCHASE: nl ? "Wat je kocht en waar" : "What you bought and where",
  }[kind];

  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={
        nl ? `${cashBookKindLabel(kind, true)} opgeslagen.` : `${cashBookKindLabel(kind, false)} saved.`
      }
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
      resetOnSuccess={!isEdit}
      onSuccess={() => {
        router.refresh();
        onSaved?.();
      }}
      footer={({ submitButton }) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
          )}
          {submitButton}
        </div>
      )}
      className="space-y-4"
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {!kindEditable && <input type="hidden" name="kind" value={kind} />}

      <div className="flex flex-wrap gap-4">
        {kindEditable && (
          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-sm font-medium text-vtk-ink">{nl ? "Soort" : "Kind"}</legend>
            <div className="flex flex-wrap gap-3 pt-2 text-sm">
              {(["WITHDRAWAL", "DEPOSIT", "PURCHASE"] as const).map((option) => (
                <label key={option} className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="kind"
                    value={option}
                    checked={kind === option}
                    onChange={() => setKind(option)}
                  />
                  {cashBookKindLabel(option, nl)}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="w-44">
          <Label htmlFor={`${uid}-date`}>{nl ? "Datum" : "Date"}</Label>
          <Input id={`${uid}-date`} name="date" type="date" required max={maxDate} defaultValue={values.date} />
        </div>
        <div className="w-40">
          <Label htmlFor={`${uid}-amount`}>{nl ? "Bedrag" : "Amount"}</Label>
          <Input
            id={`${uid}-amount`}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            required
            placeholder="0,00"
            defaultValue={values.amount}
            className="text-right tabular-nums"
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <Label htmlFor={`${uid}-description`}>{nl ? "Omschrijving" : "Description"}</Label>
          <Input
            id={`${uid}-description`}
            name="description"
            required
            maxLength={200}
            placeholder={descriptionHint}
            defaultValue={values.description}
          />
        </div>
      </div>

      {(invoiceRequired || values.invoice) && (
        <ReceiptField
          // Een andere soort kiezen mag het gekozen bestand niet weggooien, dus
          // de sleutel hangt enkel aan de regel.
          key={values.id ?? "new"}
          locale={locale}
          existing={values.invoice}
          uploadUrl="/api/admin/kassas/kasboek/upload"
          label={nl ? "Factuur" : "Invoice"}
          required={invoiceRequired}
          hint={
            nl
              ? "Foto of PDF van de factuur. Bij een aankoop met cash is die verplicht: zonder factuur kan de boekhouder de uitgave niet verantwoorden."
              : "Photo or PDF of the invoice. For a cash purchase it is required: without it the accountant cannot justify the expense."
          }
        />
      )}

      <div>
        <Label htmlFor={`${uid}-note`}>{nl ? "Opmerking (optioneel)" : "Note (optional)"}</Label>
        <Textarea id={`${uid}-note`} name="note" rows={2} maxLength={2000} defaultValue={values.note} />
      </div>
    </SaveForm>
  );
}
