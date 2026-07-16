"use client";

import { useState } from "react";
import { Button, Input } from "@vtk/ui";
import { saveProductCatalogAction } from "@/app/actions/theokot";

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
    <form action={saveProductCatalogAction} className="space-y-2">
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
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_4rem_3rem_2rem] sm:items-center">
          <input type="hidden" name={`product-${i}-id`} value={row.id} />
          <Input
            name={`product-${i}-nameNl`}
            value={row.nameNl}
            onChange={(e) => update(i, { nameNl: e.target.value })}
            placeholder={nl ? "Naam" : "Name"}
            required
          />
          <Input
            name={`product-${i}-nameEn`}
            value={row.nameEn}
            onChange={(e) => update(i, { nameEn: e.target.value })}
            placeholder={nl ? "Naam (EN)" : "Name (EN)"}
          />
          <Input
            name={`product-${i}-price`}
            value={row.priceEuro}
            onChange={(e) => update(i, { priceEuro: e.target.value })}
            inputMode="decimal"
          />
          <Input
            name={`product-${i}-quantity`}
            type="number"
            min={0}
            value={row.quantity}
            onChange={(e) => update(i, { quantity: Number(e.target.value) })}
          />
          <label className="inline-flex items-center justify-center" title={nl ? "Broodje van de week" : "Sandwich of the week"}>
            <input
              type="checkbox"
              name={`product-${i}-weekly`}
              checked={row.isWeeklySpecial}
              onChange={(e) => update(i, { isWeeklySpecial: e.target.checked })}
            />
          </label>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-zinc-400 hover:text-red-600"
            title={nl ? "Verwijderen" : "Remove"}
          >
            ✕
          </button>
        </div>
      ))}

      <Button type="button" variant="ghost" size="sm" onClick={addRow}>
        + {nl ? "Broodje toevoegen" : "Add sandwich"}
      </Button>

      <div>
        <Button type="submit">{nl ? "Standaardaanbod opslaan" : "Save default offering"}</Button>
      </div>
    </form>
  );
}
