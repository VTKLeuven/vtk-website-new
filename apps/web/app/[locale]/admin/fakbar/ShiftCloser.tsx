"use client";

import { useState } from "react";
import { Button, Input, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { closeFakbarShiftAction } from "@/app/actions/fakbar-shift";
import { formatEuroCents } from "@/lib/fakbar";
import { cashCountTotalCents, emptyCashCount, shiftTotals, type CashCount } from "@/lib/fakbar-cash";
import { CashCountGrid } from "./CashCountGrid";

export type CouponTypeRow = { id: string; name: string; valueCents: number };

/** Leest een bedrag tijdens het typen, enkel om het overzicht mee te laten rekenen. */
function euroFieldToCents(value: string): number {
  const cleaned = value.replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/**
 * "Shift afsluiten": de eindtelling van de kassa, wat er naar de kluis ging, de
 * bonnen die binnenkwamen en de SumUp-omzet. Het overzicht onderaan rekent live
 * mee, zodat een tikfout opvalt vóór het opslaan en niet pas een week later.
 */
export function ShiftCloser({
  nl,
  shiftId,
  startCents,
  couponTypes,
}: {
  nl: boolean;
  shiftId: string;
  startCents: number;
  couponTypes: CouponTypeRow[];
}) {
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState<CashCount>(emptyCashCount);
  const [vault, setVault] = useState<CashCount>(emptyCashCount);
  const [coupons, setCoupons] = useState<Record<string, number>>({});
  const [sumUp, setSumUp] = useState("");

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        {nl ? "Shift afsluiten" : "Close shift"}
      </Button>
    );
  }

  const couponCents = couponTypes.reduce(
    (sum, type) => sum + (coupons[type.id] ?? 0) * type.valueCents,
    0,
  );
  const totals = shiftTotals({
    startCents,
    endCents: cashCountTotalCents(end),
    vaultCents: cashCountTotalCents(vault),
    couponCents,
    sumUpCents: euroFieldToCents(sumUp),
  });

  const line = (label: string, cents: number | null, strong = false) => (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={strong ? "text-sm font-semibold text-vtk-ink" : "text-sm text-[#5c667f]"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          strong ? "text-base font-semibold text-vtk-ink" : "text-sm text-vtk-ink"
        }`}
      >
        {cents === null ? "—" : formatEuroCents(cents, nl)}
      </span>
    </div>
  );

  return (
    <SaveForm
      action={closeFakbarShiftAction}
      className="space-y-6"
      submitLabel={nl ? "Shift afsluiten" : "Close shift"}
      savingLabel={nl ? "Bezig..." : "Working..."}
      savedMessage={nl ? "Shift afgesloten" : "Shift closed"}
      errorMessages={{
        ALREADY_CLOSED: nl
          ? "Deze shift is intussen al afgesloten door iemand anders. Herlaad de pagina."
          : "This shift was already closed by someone else. Reload the page.",
        NOT_OPEN: nl
          ? "Deze shift bestaat niet meer. Herlaad de pagina."
          : "This shift no longer exists. Reload the page.",
        INVALID_COUNT: nl
          ? "Een aantal is geen geheel getal van 0 of meer."
          : "One of the counts is not a whole number of 0 or more.",
        INVALID_SUMUP: nl
          ? "De SumUp-omzet is geen geldig bedrag. Schrijf ze als 1234,50."
          : "The SumUp total is not a valid amount. Write it as 1234.50.",
      }}
      fallbackErrorMessage={nl ? "Afsluiten van de shift mislukt." : "Closing the shift failed."}
    >
      <input type="hidden" name="shiftId" value={shiftId} />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-vtk-ink">
            {nl ? "Kassa op het einde" : "Register at the end"}
          </h3>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Tel wat er nog in de lade zit, dus zonder wat je naar de kluis brengt."
              : "Count what is still in the drawer, so excluding what goes to the vault."}
          </p>
        </div>
        <CashCountGrid
          prefix="end"
          nl={nl}
          count={end}
          onChange={setEnd}
          label={nl ? "Eindstand" : "Closing total"}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-vtk-ink">
            {nl ? "Naar de kluis" : "To the vault"}
          </h3>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Wat je uit de lade haalt en wegbrengt. Laat leeg als er niets naar de kluis gaat."
              : "What you take out of the drawer and bring away. Leave empty if nothing goes to the vault."}
          </p>
        </div>
        <CashCountGrid
          prefix="vault"
          nl={nl}
          count={vault}
          onChange={setVault}
          label={nl ? "Naar de kluis" : "To the vault"}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-vtk-ink">{nl ? "Bonnen" : "Coupons"}</h3>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Hoeveel bonnen van elk type er binnenkwamen."
              : "How many coupons of each type came in."}
          </p>
        </div>
        {couponTypes.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {nl
              ? "Er zijn nog geen bontypes ingesteld. De Fakbar-verantwoordelijke doet dat bij het standaardaanbod."
              : "No coupon types are configured yet. The Fakbar lead sets those up under the default offering."}
          </p>
        ) : (
          <div className="space-y-2">
            {couponTypes.map((type) => {
              const quantity = coupons[type.id] ?? 0;
              return (
                <div key={type.id} className="flex items-center gap-2">
                  <span className="w-44 shrink-0 text-sm text-vtk-ink">
                    {type.name}{" "}
                    <span className="text-[#5c667f]">({formatEuroCents(type.valueCents, nl)})</span>
                  </span>
                  <Input
                    name={`coupon-${type.id}`}
                    type="number"
                    min={0}
                    step={1}
                    value={quantity === 0 ? "" : quantity}
                    placeholder="0"
                    onChange={(e) =>
                      setCoupons({
                        ...coupons,
                        [type.id]: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                    aria-label={type.name}
                    className="w-20 text-right tabular-nums"
                  />
                  <span className="text-sm tabular-nums text-[#5c667f]">
                    {quantity > 0 ? formatEuroCents(quantity * type.valueCents, nl) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-vtk-ink">SumUp</h3>
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Het totaal van de kaartbetalingen, over te nemen uit de SumUp-app."
            : "The card payment total, copied from the SumUp app."}
        </p>
        <Input
          name="sumUp"
          value={sumUp}
          onChange={(e) => setSumUp(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          aria-label={nl ? "SumUp-omzet" : "SumUp total"}
          className="w-32 text-right tabular-nums"
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-vtk-ink">{nl ? "Opmerking" : "Note"}</h3>
        <Textarea
          name="note"
          placeholder={
            nl
              ? "Optioneel: iets dat niet klopte, een defect, een uitzondering."
              : "Optional: anything that did not add up, a defect, an exception."
          }
        />
      </section>

      {/* Live overzicht: dezelfde berekening als op de afgesloten shift. */}
      <section className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 p-4">
        <h3 className="mb-1 text-sm font-semibold text-vtk-ink">{nl ? "Overzicht" : "Summary"}</h3>
        {line(nl ? "Beginstand kassa" : "Register at start", totals.startCents)}
        {line(nl ? "Eindstand kassa" : "Register at end", totals.endCents)}
        {line(nl ? "Naar de kluis" : "To the vault", totals.vaultCents)}
        <div className="my-1 border-t border-vtk-blue/10" />
        {line(nl ? "Cash-omzet" : "Cash revenue", totals.cashRevenueCents)}
        {line(nl ? "Bonnen" : "Coupons", totals.couponCents)}
        {line("SumUp", totals.sumUpCents)}
        <div className="my-1 border-t border-vtk-blue/10" />
        {line(nl ? "Totale omzet" : "Total revenue", totals.totalRevenueCents, true)}
        <p className="mt-2 text-xs text-[#5c667f]">
          {nl
            ? "Cash-omzet = eindstand + kluis − beginstand."
            : "Cash revenue = closing total + vault − starting total."}
        </p>
      </section>
    </SaveForm>
  );
}
