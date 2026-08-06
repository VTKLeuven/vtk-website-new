"use client";

import { useState } from "react";
import { Button, Input, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { saveFakbarOfferingAction } from "@/app/actions/fakbar";
import {
  FAKBAR_CATEGORIES,
  formatEuroCents,
  profitPerServingCents,
  purchasePerServingCents,
  type FakbarCategory,
} from "@/lib/fakbar";

/** Eén rij zoals ze in het formulier staat: bedragen als tekst, want het lid is
 *  ze aan het typen ("1," of "1,5") en dat hoeft nog geen geldig getal te zijn. */
export type OfferingRow = {
  /** Leeg voor een rij die nog niet in de databank staat. */
  id: string;
  name: string;
  category: FakbarCategory;
  purchaseUnitEuro: string;
  servingsPerUnit: string;
  salePriceEuro: string;
};

/** Naam · categorie · prijs/eenheid · consumpties · aankoop · verkoop · winst · knop. */
const COLUMNS =
  "sm:grid-cols-[minmax(8rem,1fr)_8rem_6rem_5rem_6rem_6rem_6rem_2rem]";

/** Leest een bedrag tijdens het typen; enkel om de afgeleide kolommen te tonen. */
function euroFieldToCents(value: string): number {
  const cleaned = value.replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "") return Number.NaN;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

/**
 * Categoriekeuze die er hetzelfde uitziet als de invoervelden ernaast.
 *
 * Een native select tekent zichzelf: hij rekent zijn eigen hoogte uit en negeert
 * (in Safari) de `border-radius`, waardoor hij naast een Input te klein en te
 * hoekig staat. In een stapelformulier valt dat niet op, op één rij wel. Met
 * `appearance-none` wordt het een gewoon vakje dat de rand en de padding van
 * `Select` volgt; het pijltje dat daarmee verdwijnt tekenen we er zelf naast.
 */
function CategorySelect({
  name,
  value,
  label,
  nl,
  onChange,
}: {
  name: string;
  value: FakbarCategory;
  label: string;
  nl: boolean;
  onChange: (category: FakbarCategory) => void;
}) {
  return (
    <div className="relative">
      <Select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value as FakbarCategory)}
        aria-label={label}
        // 38px = 20px regelhoogte + 2x8px padding + 2x1px rand, net als een Input.
        className="h-[38px] appearance-none pr-8"
      >
        {FAKBAR_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {nl ? c.nl : c.en}
          </option>
        ))}
      </Select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[#5c667f]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}

function derived(row: OfferingRow) {
  const input = {
    purchaseUnitCents: euroFieldToCents(row.purchaseUnitEuro),
    servingsPerUnit: Number(row.servingsPerUnit),
    salePriceCents: euroFieldToCents(row.salePriceEuro),
  };
  return {
    purchase: purchasePerServingCents(input),
    profit: profitPerServingCents(input),
  };
}

/**
 * Bewerkt het volledige standaardaanbod als één lijst, gegroepeerd per
 * categorie. De aankoopprijs per consumptie en de winst per consumptie staan
 * ernaast en rekenen mee terwijl je typt; ze zijn afgeleid van de andere
 * kolommen en dus niet invulbaar. Verandert een rij van categorie, dan springt
 * ze mee naar de andere groep.
 *
 * Verwijderen gebeurt niet meteen: een rij verdwijnt uit de lijst en pas bij het
 * opslaan uit de databank. Boven de opslaan-knop staat dan expliciet welke
 * dranken weggaan en dat de rest blijft.
 */
export function FakbarOfferingManager({
  nl,
  initial,
}: {
  nl: boolean;
  initial: OfferingRow[];
}) {
  const [rows, setRows] = useState<OfferingRow[]>(initial);
  const [removed, setRemoved] = useState<OfferingRow[]>([]);

  function update(index: number, patch: Partial<OfferingRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow(category: FakbarCategory) {
    setRows((current) => [
      ...current,
      {
        id: "",
        name: "",
        category,
        purchaseUnitEuro: "0.00",
        servingsPerUnit: "1",
        salePriceEuro: "0.00",
      },
    ]);
  }

  function removeRow(index: number) {
    const row = rows[index];
    setRows((current) => current.filter((_, i) => i !== index));
    // Enkel een rij die al bewaard is verdwijnt écht bij het opslaan; een net
    // toegevoegde, nog lege rij hoeft geen waarschuwing.
    if (row.id) setRemoved((current) => [...current, row]);
  }

  const header = (
    <div
      className={`hidden gap-2 border-b border-vtk-blue/10 pb-1 text-xs font-semibold uppercase tracking-wide text-[#5c667f] sm:grid ${COLUMNS}`}
    >
      <span>{nl ? "Naam" : "Name"}</span>
      <span>{nl ? "Categorie" : "Category"}</span>
      <span>{nl ? "Prijs / eenheid" : "Price / unit"}</span>
      <span>{nl ? "Consumpties" : "Servings"}</span>
      <span className="text-right">{nl ? "Aankoop / cons." : "Cost / serving"}</span>
      <span>{nl ? "Verkoop / cons." : "Sale / serving"}</span>
      <span className="text-right">{nl ? "Winst / cons." : "Profit / serving"}</span>
      <span />
    </div>
  );

  return (
    <SaveForm
      action={saveFakbarOfferingAction}
      className="space-y-5"
      submitLabel={nl ? "Aanbod opslaan" : "Save offering"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Standaardaanbod opgeslagen" : "Default offering saved"}
      errorMessages={{
        INVALID_PRICE: nl
          ? "Een bedrag is leeg of geen geldig getal. Schrijf het als 1,55."
          : "An amount is empty or not a valid number. Write it as 1.55.",
        INVALID_SERVINGS: nl
          ? "Consumpties per aankoopeenheid moet een geheel getal van minstens 1 zijn."
          : "Servings per purchase unit must be a whole number of at least 1.",
        INVALID_CATEGORY: nl ? "Onbekende categorie." : "Unknown category.",
      }}
      fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
    >
      <input type="hidden" name="drinkCount" value={rows.length} />

      {FAKBAR_CATEGORIES.map((category) => {
        // De index in `rows` bepaalt de veldnamen, dus die houden we bij: het
        // formulier blijft kloppen ook al staat de rij visueel elders.
        const entries = rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => row.category === category.value);

        return (
          <section key={category.value} className="space-y-2">
            <h3 className="text-sm font-semibold text-vtk-ink">{nl ? category.nl : category.en}</h3>
            {entries.length > 0 && header}

            {entries.map(({ row, index }) => {
              const { purchase, profit } = derived(row);
              return (
                <div
                  key={index}
                  className={`grid gap-2 border-b border-vtk-blue/10 pb-3 sm:items-center sm:border-0 sm:pb-0 ${COLUMNS}`}
                >
                  <input type="hidden" name={`drink-${index}-id`} value={row.id} />
                  <Input
                    name={`drink-${index}-name`}
                    value={row.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                    placeholder={nl ? "Naam" : "Name"}
                    required
                  />
                  <CategorySelect
                    name={`drink-${index}-category`}
                    value={row.category}
                    label={nl ? "Categorie" : "Category"}
                    nl={nl}
                    onChange={(category) => update(index, { category })}
                  />
                  <Input
                    name={`drink-${index}-purchaseUnit`}
                    value={row.purchaseUnitEuro}
                    onChange={(e) => update(index, { purchaseUnitEuro: e.target.value })}
                    inputMode="decimal"
                    aria-label={nl ? "Prijs per aankoopeenheid" : "Price per purchase unit"}
                  />
                  <Input
                    name={`drink-${index}-servings`}
                    type="number"
                    min={1}
                    step={1}
                    value={row.servingsPerUnit}
                    onChange={(e) => update(index, { servingsPerUnit: e.target.value })}
                    aria-label={nl ? "Consumpties per aankoopeenheid" : "Servings per purchase unit"}
                  />
                  {/* Afgeleid: geen invoerveld, maar wel meteen zichtbaar. */}
                  <span className="text-sm tabular-nums text-[#5c667f] sm:text-right">
                    <span className="sm:hidden">{nl ? "Aankoop / cons.: " : "Cost / serving: "}</span>
                    {purchase === null ? "—" : formatEuroCents(purchase, nl)}
                  </span>
                  <Input
                    name={`drink-${index}-salePrice`}
                    value={row.salePriceEuro}
                    onChange={(e) => update(index, { salePriceEuro: e.target.value })}
                    inputMode="decimal"
                    aria-label={nl ? "Verkoopprijs per consumptie" : "Sale price per serving"}
                  />
                  <span
                    className={`text-sm font-medium tabular-nums sm:text-right ${
                      profit !== null && profit < 0 ? "text-red-600" : "text-vtk-ink"
                    }`}
                  >
                    <span className="font-normal text-[#5c667f] sm:hidden">
                      {nl ? "Winst / cons.: " : "Profit / serving: "}
                    </span>
                    {profit === null ? "—" : formatEuroCents(profit, nl)}
                  </span>
                  <IconButton
                    label={nl ? "Uit de lijst halen" : "Remove from the list"}
                    srLabel={
                      nl
                        ? `Uit de lijst halen: ${row.name || "nieuwe drank"}`
                        : `Remove from the list: ${row.name || "new drink"}`
                    }
                    tone="danger"
                    onClick={() => removeRow(index)}
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              );
            })}

            <Button type="button" variant="ghost" size="sm" onClick={() => addRow(category.value)}>
              + {nl ? "Drank toevoegen" : "Add drink"}
            </Button>
          </section>
        );
      })}

      {removed.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">
            {nl
              ? `Bij het opslaan verdwijnen ${removed.length} dranken uit het aanbod:`
              : `Saving will remove ${removed.length} drinks from the offering:`}
          </p>
          <p className="mt-1">
            {removed.map((r) => r.name || (nl ? "(zonder naam)" : "(unnamed)")).join(", ")}
          </p>
          <p className="mt-1">
            {nl
              ? "De rest van de lijst blijft staan. Herlaad de pagina om de verwijdering ongedaan te maken."
              : "The rest of the list stays. Reload the page to undo the removal."}
          </p>
        </div>
      )}
    </SaveForm>
  );
}
