"use client";

import { useRef, useState } from "react";
import { Button, Input, Label } from "@vtk/ui";
import { StorageImageField } from "@/components/admin/StorageImageField";

export type OfferingRow = {
  /** Leeg voor een nieuwe rij; gevuld voor een bestaand item/product. */
  id: string;
  nameNl: string;
  nameEn: string;
  priceEuro: string;
  quantity: number;
  isWeeklySpecial: boolean;
  imageKey: string | null;
  ingredientsNl: string;
  ingredientsEn: string;
  /** Heeft dit item al bestellingen? Dan blijft het bij opslaan behouden. */
  hasLines: boolean;
};

/** Nieuwe, lege rij. Prijs en aantal zijn het gangbare startpunt, geen dogma. */
export function emptyOfferingRow(): OfferingRow {
  return {
    id: "",
    nameNl: "",
    nameEn: "",
    priceEuro: "2.60",
    quantity: 10,
    isWeeklySpecial: false,
    imageKey: null,
    ingredientsNl: "",
    ingredientsEn: "",
    hasLines: false,
  };
}

type Editable = OfferingRow & { uid: number };

/**
 * Bewerkbare aanbodtabel, gedeeld door de catalogus (Instellingen) en het aanbod
 * per verkoopdag. Rendert per rij de velden
 * `<prefix>-<i>-{id,nameNl,nameEn,price,quantity,weekly,ingredientsNl,ingredientsEn,imageKey}`
 * plus een `<countField>`, gelezen door `parseOfferingRows` in de actions.
 *
 * Foto en ingrediënten zitten achter een uitklap per rij: ze zijn optioneel, en
 * een uploadveld per rij zou de tabel onleesbaar maken. De samenvatting naast de
 * uitklap zegt of ze ingevuld zijn, zodat je dat ziet zonder alles open te klappen.
 */
export function OfferingRows({
  nl,
  initial,
  prefix,
  countField,
}: {
  nl: boolean;
  initial: OfferingRow[];
  prefix: "item" | "product";
  countField: "itemCount" | "productCount";
}) {
  // Een rij-id dat niet mee opschuift bij verwijderen: de React-key moet aan de
  // rij hangen en niet aan de index, anders houdt het fotoveld van rij 3 zijn
  // voorbeeld vast wanneer rij 2 verdwijnt.
  const nextUid = useRef(initial.length);
  const [rows, setRows] = useState<Editable[]>(() => initial.map((row, i) => ({ ...row, uid: i })));
  const locale = nl ? "nl" : "en";

  function update(uid: number, patch: Partial<OfferingRow>) {
    setRows((r) => r.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { ...emptyOfferingRow(), uid: nextUid.current++ }]);
  }
  function removeRow(uid: number) {
    setRows((r) => r.filter((row) => row.uid !== uid));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={countField} value={rows.length} />

      <div className="hidden gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-[#5c667f] sm:grid sm:grid-cols-[1fr_1fr_5rem_4rem_3rem_2rem]">
        <span>{nl ? "Naam (NL)" : "Name (NL)"}</span>
        <span>{nl ? "Naam (EN)" : "Name (EN)"}</span>
        <span>{nl ? "Prijs €" : "Price €"}</span>
        <span>{nl ? "Aantal" : "Qty"}</span>
        <span>{nl ? "V/d week" : "Weekly"}</span>
        <span />
      </div>

      {rows.map((row, i) => (
        <div key={row.uid} className="rounded-xl border border-vtk-blue/10 p-3">
          <input type="hidden" name={`${prefix}-${i}-id`} value={row.id} />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_4rem_3rem_2rem] sm:items-center">
            <Cell label={nl ? "Naam (NL)" : "Name (NL)"}>
              <Input
                name={`${prefix}-${i}-nameNl`}
                value={row.nameNl}
                onChange={(e) => update(row.uid, { nameNl: e.target.value })}
                placeholder={nl ? "Naam" : "Name"}
                required
              />
            </Cell>
            <Cell label={nl ? "Naam (EN)" : "Name (EN)"}>
              <Input
                name={`${prefix}-${i}-nameEn`}
                value={row.nameEn}
                onChange={(e) => update(row.uid, { nameEn: e.target.value })}
                placeholder={nl ? "Naam (EN)" : "Name (EN)"}
              />
            </Cell>
            <Cell label={nl ? "Prijs €" : "Price €"}>
              <Input
                name={`${prefix}-${i}-price`}
                value={row.priceEuro}
                onChange={(e) => update(row.uid, { priceEuro: e.target.value })}
                inputMode="decimal"
              />
            </Cell>
            <Cell label={nl ? "Aantal" : "Qty"}>
              <Input
                name={`${prefix}-${i}-quantity`}
                type="number"
                min={0}
                value={row.quantity}
                onChange={(e) => update(row.uid, { quantity: Number(e.target.value) })}
              />
            </Cell>
            <label
              className="inline-flex items-center gap-2 text-sm sm:justify-center sm:gap-0"
              title={nl ? "Broodje van de week" : "Sandwich of the week"}
            >
              <input
                type="checkbox"
                name={`${prefix}-${i}-weekly`}
                checked={row.isWeeklySpecial}
                onChange={(e) => update(row.uid, { isWeeklySpecial: e.target.checked })}
              />
              <span className="sm:hidden">{nl ? "Broodje van de week" : "Sandwich of the week"}</span>
            </label>
            <button
              type="button"
              onClick={() => removeRow(row.uid)}
              className="inline-flex items-center gap-2 justify-self-start text-sm text-zinc-400 hover:text-red-600 sm:justify-self-auto"
              title={
                row.hasLines
                  ? nl
                    ? "Heeft bestellingen; blijft behouden"
                    : "Has orders; kept"
                  : nl
                    ? "Verwijderen"
                    : "Remove"
              }
            >
              ✕
              <span className="sm:hidden">{nl ? "Verwijderen" : "Remove"}</span>
            </button>
          </div>

          <details className="mt-2 border-t border-vtk-blue/10 pt-2">
            <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
              {nl ? "Foto & ingrediënten" : "Photo & ingredients"}
              <span className="ml-2 text-xs text-[#5c667f]">{summary(nl, row)}</span>
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <StorageImageField
                name={`${prefix}-${i}-imageKey`}
                defaultKey={row.imageKey}
                locale={locale}
                label={nl ? "Foto" : "Photo"}
                srContext={row.nameNl || undefined}
                helpText={
                  nl
                    ? "Optioneel. Zonder foto toont de bestelpagina het gestreepte patroon."
                    : "Optional. Without a photo the order page shows the striped pattern."
                }
                onChange={(key) => update(row.uid, { imageKey: key || null })}
              />
              <div className="grid content-start gap-3">
                <div>
                  <Label>{nl ? "Ingrediënten (NL)" : "Ingredients (NL)"}</Label>
                  <Input
                    name={`${prefix}-${i}-ingredientsNl`}
                    value={row.ingredientsNl}
                    onChange={(e) => update(row.uid, { ingredientsNl: e.target.value })}
                    placeholder={nl ? "bv. kaas, hesp, sla, tomaat, mayonaise" : "e.g. cheese, ham, lettuce, tomato"}
                  />
                </div>
                <div>
                  <Label>{nl ? "Ingrediënten (EN)" : "Ingredients (EN)"}</Label>
                  <Input
                    name={`${prefix}-${i}-ingredientsEn`}
                    value={row.ingredientsEn}
                    onChange={(e) => update(row.uid, { ingredientsEn: e.target.value })}
                    placeholder={nl ? "bv. cheese, ham, lettuce, tomato" : "e.g. cheese, ham, lettuce, tomato"}
                  />
                </div>
                <p className="text-xs text-[#5c667f]">
                  {nl
                    ? "Optioneel. Ingevuld verschijnt er een info-icoontje naast het broodje op de bestelpagina."
                    : "Optional. When filled in, an info icon appears next to the sandwich on the order page."}
                </p>
              </div>
            </div>
          </details>
        </div>
      ))}

      <Button type="button" variant="ghost" size="sm" onClick={addRow}>
        + {nl ? "Broodje toevoegen" : "Add sandwich"}
      </Button>
    </div>
  );
}

/** Wat deze rij al heeft, zodat je het ziet zonder de uitklap te openen. */
function summary(nl: boolean, row: OfferingRow): string {
  const parts: string[] = [];
  if (row.imageKey) parts.push(nl ? "foto" : "photo");
  if (row.ingredientsNl.trim() || row.ingredientsEn.trim()) {
    parts.push(nl ? "ingrediënten" : "ingredients");
  }
  if (parts.length === 0) return nl ? "· nog geen foto of ingrediënten" : "· no photo or ingredients yet";
  return `· ${parts.join(" + ")}`;
}

/**
 * Eén veld in een aanbodrij. Breed staan de kolomkoppen boven de tabel; smal
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
