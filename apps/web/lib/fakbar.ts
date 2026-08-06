/**
 * Rekenwerk en categorieën van het Fakbar-standaardaanbod.
 *
 * Van elke drank bewaren we drie cijfers: wat één aankoopeenheid kost (een vat,
 * een bak, een fles), hoeveel consumpties daaruit gaan, en wat één consumptie
 * over de toog kost. De aankoopprijs per consumptie en de winst per consumptie
 * volgen daaruit en worden hier berekend, niet bewaard: als kolom zouden ze na
 * een prijswijziging stil uit de pas lopen met de cijfers waar ze uit volgen.
 *
 * Bedragen zijn eurocent. Per consumptie is dat vaak geen rond getal (een vat
 * van € 155 met 200 pinten is 77,5 cent per pint), dus die tussenresultaten
 * blijven bewust een float; enkel bij het tonen wordt er afgerond.
 */

export const FAKBAR_CATEGORIES = [
  { value: "VATEN", nl: "Vaten", en: "Kegs" },
  { value: "BIEREN", nl: "Bieren", en: "Beers" },
  { value: "WIJNEN", nl: "Wijnen", en: "Wines" },
  { value: "FRISDRANK", nl: "Frisdrank", en: "Soft drinks" },
  { value: "STERKE_DRANK", nl: "Sterke dranken", en: "Spirits" },
] as const;

export type FakbarCategory = (typeof FAKBAR_CATEGORIES)[number]["value"];

const CATEGORY_VALUES = FAKBAR_CATEGORIES.map((c) => c.value) as readonly string[];

export function isFakbarCategory(value: unknown): value is FakbarCategory {
  return typeof value === "string" && CATEGORY_VALUES.includes(value);
}

export function fakbarCategoryLabel(category: FakbarCategory, nl: boolean): string {
  const entry = FAKBAR_CATEGORIES.find((c) => c.value === category);
  if (!entry) return category;
  return nl ? entry.nl : entry.en;
}

/** De cijfers waaruit een marge volgt. Los van Prisma, zodat de client dezelfde
 *  functies gebruikt als de server en de tabel live meerekent tijdens het typen. */
export type FakbarMarginInput = {
  purchaseUnitCents: number;
  servingsPerUnit: number;
  salePriceCents: number;
};

/**
 * Aankoopprijs van één consumptie, in (mogelijk gebroken) eurocent. Geeft `null`
 * bij nul of minder consumpties per aankoopeenheid: dan valt er niets te delen
 * en is een streepje eerlijker dan een verzonnen getal.
 */
export function purchasePerServingCents(p: FakbarMarginInput): number | null {
  if (!Number.isFinite(p.servingsPerUnit) || p.servingsPerUnit <= 0) return null;
  if (!Number.isFinite(p.purchaseUnitCents)) return null;
  return p.purchaseUnitCents / p.servingsPerUnit;
}

/** Winst op één consumptie, in eurocent. `null` zodra de aankoopprijs onbekend is. */
export function profitPerServingCents(p: FakbarMarginInput): number | null {
  const purchase = purchasePerServingCents(p);
  if (purchase === null || !Number.isFinite(p.salePriceCents)) return null;
  return p.salePriceCents - purchase;
}

/** Eurocent -> "€ 1,23". Afronden gebeurt enkel hier, op het scherm. */
export function formatEuroCents(cents: number, nl: boolean): string {
  return new Intl.NumberFormat(nl ? "nl-BE" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** "2,60" / "2.60" / "€ 2,60" -> 260 eurocent. `null` bij ongeldige invoer. */
export function euroToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Eurocent -> "2.60", de waarde zoals ze in een prijsveld staat. */
export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
