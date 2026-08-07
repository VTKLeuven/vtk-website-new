"use client";

import { useState } from "react";
import { Button, Input } from "@vtk/ui";
import { saveProductCatalogAction } from "@/app/actions/theokot";
import { SaveForm } from "@/components/ui/SaveForm";

export type CatalogItem = {
  id: string;
  nameNl: string;
  nameEn: string;
  priceEuro: string;
  quantity: number;
  isWeeklySpecial: boolean;
};

/**
 * Bewerkt de standaardcatalogus (`TheokotProduct`): namen, prijzen, aantallen en
 * "broodje van de week"-slot. Deze waarden zijn het startpunt van elk aanbod bij
 * "Verkoopweek aanmaken". Rendert per rij `product-<i>-{id,nameNl,nameEn,price,quantity,weekly}`
 * plus een `productCount`, gelezen door {@link saveProductCatalogAction}.
 */
export function ProductCatalogManager({ nl, initial }: { nl: boolean; initial: CatalogItem[] }) {
  const [rows, setRows] = useState<CatalogItem[]>(initial);

  function update(i: number, patch: Partial<CatalogItem>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [
      ...r,
      { id: "", nameNl: "", nameEn: "", priceEuro: "2.60", quantity: 10, isWeeklySpecial: false },
    ]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  return (
    <SaveForm
      action={saveProductCatalogAction}
      className="space-y-2"
      submitLabel={nl ? "Standaardaanbod opslaan" : "Save default offering"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Standaardaanbod opgeslagen" : "Default offering saved"}
      fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
    >
      <input type="hidden" name="productCount" value={rows.length} />

      <div className="hidden gap-2 text-xs font-semibold uppercase tracking-wide text-[#5c667f] sm:grid sm:grid-cols-[1fr_1fr_5rem_4rem_3rem_2rem]">
        <span>{nl ? "Naam (NL)" : "Name (NL)"}</span>
        <span>{nl ? "Naam (EN)" : "Name (EN)"}</span>
        <span>{nl ? "Prijs €" : "Price €"}</span>
        <span>{nl ? "Aantal" : "Qty"}</span>
        <span>{nl ? "V/d week" : "Weekly"}</span>
        <span />
      </div>

      {rows.map((row, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-xl border border-vtk-blue/10 p-3 sm:grid-cols-[1fr_1fr_5rem_4rem_3rem_2rem] sm:items-center sm:rounded-none sm:border-0 sm:p-0"
        >
          <input type="hidden" name={`product-${i}-id`} value={row.id} />
          <Cell label={nl ? "Naam (NL)" : "Name (NL)"}>
            <Input
              name={`product-${i}-nameNl`}
              value={row.nameNl}
              onChange={(e) => update(i, { nameNl: e.target.value })}
              placeholder={nl ? "Naam" : "Name"}
              required
            />
          </Cell>
          <Cell label={nl ? "Naam (EN)" : "Name (EN)"}>
            <Input
              name={`product-${i}-nameEn`}
              value={row.nameEn}
              onChange={(e) => update(i, { nameEn: e.target.value })}
              placeholder={nl ? "Naam (EN)" : "Name (EN)"}
            />
          </Cell>
          <Cell label={nl ? "Prijs €" : "Price €"}>
            <Input
              name={`product-${i}-price`}
              value={row.priceEuro}
              onChange={(e) => update(i, { priceEuro: e.target.value })}
              inputMode="decimal"
            />
          </Cell>
          <Cell label={nl ? "Aantal" : "Qty"}>
            <Input
              name={`product-${i}-quantity`}
              type="number"
              min={0}
              value={row.quantity}
              onChange={(e) => update(i, { quantity: Number(e.target.value) })}
            />
          </Cell>
          <label
            className="inline-flex items-center gap-2 text-sm sm:justify-center sm:gap-0"
            title={nl ? "Broodje van de week" : "Sandwich of the week"}
          >
            <input
              type="checkbox"
              name={`product-${i}-weekly`}
              checked={row.isWeeklySpecial}
              onChange={(e) => update(i, { isWeeklySpecial: e.target.checked })}
            />
            <span className="sm:hidden">{nl ? "Broodje van de week" : "Sandwich of the week"}</span>
          </label>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="inline-flex items-center gap-2 justify-self-start text-sm text-zinc-400 hover:text-red-600 sm:justify-self-auto"
            title={nl ? "Verwijderen" : "Remove"}
          >
            ✕
            <span className="sm:hidden">{nl ? "Verwijderen" : "Remove"}</span>
          </button>
        </div>
      ))}

      <Button type="button" variant="ghost" size="sm" onClick={addRow}>
        + {nl ? "Broodje toevoegen" : "Add sandwich"}
      </Button>

    </SaveForm>
  );
}

/**
 * Eén veld in een productrij. Breed staan de kolomkoppen boven de tabel; smal
 * staat elk veld onder elkaar en heeft het zijn eigen opschrift nodig, anders
 * is een rij een stapel naamloze vakjes.
 */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f] sm:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}
