"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { parseCountInput, type Counts } from "@/lib/kassas/kassa";
import type { PermanentEntryKind } from "@/lib/kassas/permanent";
import { countInputsFrom, DenominationGrid, inputsTotalCents } from "../DenominationGrid";

export type EntryFormValues = {
  /** Leeg bij een nieuwe regel. */
  id?: string;
  groupId: string;
  kind: PermanentEntryKind;
  /** "YYYY-MM-DD". */
  date: string;
  /** Bedrag bij meegeven en teruggeven, zoals in het veld ("125,50"). */
  cash: string;
  /** Stuks per coupure bij een telling; `null` = nog niets ingevuld. */
  counts: Counts | null;
  shiftVouchers: string;
  elixirVouchers: string;
  closesRegister: boolean;
  note: string;
};

/**
 * Eén regel van een vaste kassa: meegeven, terugkrijgen of tellen. Een telling
 * gaat per coupure, met hetzelfde raster als de gewone kassa's, en rekent het
 * totaal mee terwijl je typt; zo zie je een tikfout aan een vreemd bedrag.
 */
export function EntryForm({
  locale,
  action,
  values,
  postName,
  shiftVoucherValueCents,
  elixirVoucherValueCents,
  minDate,
  maxDate,
  errorMessages,
  onCancel,
  onSaved,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  values: EntryFormValues;
  postName: string;
  shiftVoucherValueCents: number;
  elixirVoucherValueCents: number;
  /** De vroegste datum die je mag kiezen (een post: veertien dagen terug). */
  minDate?: string;
  maxDate: string;
  errorMessages: Record<string, string>;
  /** Toont een knop "Annuleren" naast opslaan. */
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const nl = locale === "nl";
  const uid = useId();
  const router = useRouter();
  const isEdit = Boolean(values.id);
  const isCount = values.kind === "COUNT";
  const isReturn = values.kind === "RETURNED";
  const euro = (cents: number) => formatEuro(cents, locale);

  const [coins, setCoins] = useState(() => countInputsFrom(values.counts));
  const [shift, setShift] = useState(values.shiftVouchers);
  const [elixir, setElixir] = useState(values.elixirVouchers);
  const [closes, setCloses] = useState(values.closesRegister);

  const pieces = (raw: string) => {
    const parsed = parseCountInput(raw);
    return typeof parsed === "number" ? parsed : 0;
  };
  const vouchers = pieces(shift) + pieces(elixir);
  const voucherCents = pieces(shift) * shiftVoucherValueCents + pieces(elixir) * elixirVoucherValueCents;
  const cashCents = inputsTotalCents(coins);

  const saved = {
    HANDED_OUT: nl ? "Meegegeven opgeslagen." : "Handed out saved.",
    RETURNED: nl ? "Teruggegeven opgeslagen." : "Returned saved.",
    COUNT: nl ? "Telling opgeslagen." : "Count saved.",
  }[values.kind];

  return (
    <SaveForm
      action={action}
      submitLabel={isCount ? (nl ? "Telling opslaan" : "Save count") : nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={saved}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
      resetOnSuccess={!isEdit}
      onSuccess={() => {
        // Het raster volgt `form.reset()` zelf; de bonnen en het vinkje zijn
        // gecontroleerd en moeten mee leeg.
        if (!isEdit) {
          setShift("");
          setElixir("");
          setCloses(false);
        }
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
      className="space-y-5"
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="groupId" value={values.groupId} />
      <input type="hidden" name="kind" value={values.kind} />

      <div className="flex flex-wrap gap-4">
        <div className="w-44">
          <Label htmlFor={`${uid}-date`}>{isCount ? (nl ? "Geteld op" : "Counted on") : nl ? "Datum" : "Date"}</Label>
          <Input
            id={`${uid}-date`}
            name="date"
            type="date"
            required
            min={minDate}
            max={maxDate}
            defaultValue={values.date}
          />
        </div>
        {!isCount && (
          <div className="w-44">
            <Label htmlFor={`${uid}-cash`}>{nl ? "Bedrag cash" : "Cash amount"}</Label>
            <Input
              id={`${uid}-cash`}
              name="cash"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              defaultValue={values.cash}
              className="text-right tabular-nums"
            />
          </div>
        )}
      </div>

      {isCount && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-vtk-ink">{nl ? "Munten en briefjes" : "Coins and notes"}</h3>
            <span className="text-sm text-vtk-body">
              {nl ? "Cash" : "Cash"} <strong className="tabular-nums text-vtk-ink">{euro(cashCents)}</strong>
            </span>
          </div>
          <p className="mb-3 mt-1 text-xs text-vtk-muted">
            {nl
              ? "Hoeveel stuks van elke munt en elk briefje er in de kassa zitten. Vul 0 in voor wat er niet in zit."
              : "How many of each coin and note are in the register. Enter 0 for what is not in it."}
          </p>
          <DenominationGrid
            locale={locale}
            prefix="c_"
            idPrefix={`${uid}-c`}
            values={coins}
            onChange={setCoins}
          />
        </section>
      )}

      {(isCount || isReturn) && (
        <div className="flex flex-wrap gap-4">
          <div className="w-36">
            <Label htmlFor={`${uid}-shift`}>{nl ? "Shiftersbonnen" : "Shift vouchers"}</Label>
            <Input
              id={`${uid}-shift`}
              name="shiftVouchers"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              className="text-right tabular-nums"
            />
          </div>
          <div className="w-36">
            <Label htmlFor={`${uid}-elixir`}>{nl ? "Elixirbonnen" : "Elixir vouchers"}</Label>
            <Input
              id={`${uid}-elixir`}
              name="elixirVouchers"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={elixir}
              onChange={(event) => setElixir(event.target.value)}
              className="text-right tabular-nums"
            />
          </div>
          <p className="self-end pb-2 text-xs text-vtk-muted">
            {nl
              ? `Een shiftersbon telt aan ${euro(shiftVoucherValueCents)}, een elixirbon aan ${euro(elixirVoucherValueCents)}.`
              : `A shift voucher counts at ${euro(shiftVoucherValueCents)}, an elixir voucher at ${euro(elixirVoucherValueCents)}.`}
          </p>
        </div>
      )}

      {isReturn && (
        <label className="flex items-start gap-3 text-sm text-vtk-body">
          <input
            type="checkbox"
            name="closesRegister"
            checked={closes}
            onChange={(event) => setCloses(event.target.checked)}
            className="mt-1"
          />
          <span>
            <strong className="font-semibold text-vtk-ink">
              {nl ? "De volledige kassa kwam terug." : "The whole register came back."}
            </strong>{" "}
            {closes
              ? nl
                ? `Daarna staat de kassa van ${postName} op € 0, en loopt de winst van dit kwartaal tot deze dag. Vul dus het volledige bedrag in, met de bonnen erbij.`
                : `The ${postName} register then stands at € 0, and this quarter's profit runs until this day. So enter the full amount, vouchers included.`
              : nl
                ? "Bijvoorbeeld op het einde van het werkingsjaar."
                : "For example at the end of the working year."}
          </span>
        </label>
      )}

      <div>
        <Label htmlFor={`${uid}-note`}>{nl ? "Opmerking (optioneel)" : "Note (optional)"}</Label>
        <Input
          id={`${uid}-note`}
          name="note"
          maxLength={500}
          defaultValue={values.note}
          placeholder={
            values.kind === "HANDED_OUT"
              ? nl
                ? "bv. startkassa tweede semester"
                : "e.g. starting float second semester"
              : values.kind === "RETURNED"
                ? nl
                  ? "bv. naar de bank"
                  : "e.g. to the bank"
                : nl
                  ? "bv. twee briefjes van € 50 apart in de kluis"
                  : "e.g. two € 50 notes kept separately in the safe"
          }
        />
      </div>

      {isCount && (
        <p className="border-t border-vtk-blue/10 pt-4 text-sm text-vtk-body">
          {nl ? "In de kassa" : "In the register"}{" "}
          <strong className="text-base tabular-nums text-vtk-ink">{euro(cashCents + voucherCents)}</strong>
          {vouchers > 0 && (
            <span className="text-vtk-muted">
              {" "}
              ({euro(cashCents)} {nl ? "cash en" : "cash and"} {vouchers} {nl ? (vouchers === 1 ? "bon" : "bonnen") : vouchers === 1 ? "voucher" : "vouchers"})
            </span>
          )}
        </p>
      )}
    </SaveForm>
  );
}
