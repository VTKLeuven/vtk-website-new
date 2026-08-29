import type { FakbarConsumptionCategory, FakbarItemCategory } from '@prisma/client';

/**
 * Labels, volgorde en geldopmaak op één plek. De categorieën stonden eerder in
 * vier bestanden los van elkaar, met per bestand een andere volgorde en een
 * andere spelling.
 */

export const CATEGORY_ORDER: FakbarItemCategory[] = ['VAT', 'BIER_WIJN', 'FRISDRANK', 'STERK'];

export const CATEGORY_LABELS: Record<FakbarItemCategory, string> = {
  VAT: "Bieren van 't vat",
  BIER_WIJN: 'Bieren op fles & wijn',
  FRISDRANK: 'Frisdrank',
  STERK: 'Sterke drank',
};

export const CATEGORY_ICONS: Record<FakbarItemCategory, 'beer' | 'bottle' | 'soda' | 'spirit'> = {
  VAT: 'beer',
  BIER_WIJN: 'bottle',
  FRISDRANK: 'soda',
  STERK: 'spirit',
};

/**
 * De rubrieken van het tappersblad: drank die wel weggaat maar niets opbrengt,
 * plus de verkoop zelf. Alles behalve `VERKOOP` telt als gemiste inkomsten.
 */
export const CONSUMPTION_ORDER: FakbarConsumptionCategory[] = [
  'TAPPERSDRANK',
  'VERJAARDAGEN',
  'ZAKPINTJES',
  'MISLUKTE_PINTEN',
  'KLANTENKAART',
  'SUCCESPINTEN',
];

export const CONSUMPTION_LABELS: Record<FakbarConsumptionCategory, string> = {
  TAPPERSDRANK: 'Tappersdrank',
  VERJAARDAGEN: 'Verjaardagen',
  ZAKPINTJES: 'Zakpintjes',
  MISLUKTE_PINTEN: 'Mislukte pinten',
  KLANTENKAART: 'Klantenkaart',
  SUCCESPINTEN: 'Succespinten',
  VERKOOP: 'Verkoop',
};

/** Bedragen zitten in de databank in cent; nooit in euro's met kommagetallen. */
export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Euro's zoals iemand ze in een formulier tikt ("12,50" of "12.50") naar cent. */
export function parseEuroToCents(raw: FormDataEntryValue | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^€\s*/, '').replace(',', '.');
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Een geheel aantal stuks uit een formulierveld; leeg telt als 0. */
export function parseCount(raw: FormDataEntryValue | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/** De muntstukken en biljetten in de kassa, met hun waarde in cent. */
export const DENOMINATIONS = [
  { field: 'cnt_0_05', label: '€ 0,05', cents: 5 },
  { field: 'cnt_0_10', label: '€ 0,10', cents: 10 },
  { field: 'cnt_0_20', label: '€ 0,20', cents: 20 },
  { field: 'cnt_0_50', label: '€ 0,50', cents: 50 },
  { field: 'cnt_1_00', label: '€ 1', cents: 100 },
  { field: 'cnt_2_00', label: '€ 2', cents: 200 },
  { field: 'cnt_5_00', label: '€ 5', cents: 500 },
  { field: 'cnt_10_00', label: '€ 10', cents: 1000 },
  { field: 'cnt_20_00', label: '€ 20', cents: 2000 },
  { field: 'cnt_50_00', label: '€ 50', cents: 5000 },
  { field: 'cnt_100_00', label: '€ 100', cents: 10000 },
] as const;

/**
 * Bonnen zijn géén geld in de kassa. Ze worden geteld omdat ze verklaren waarom
 * er drank weg is zonder dat er cash tegenover staat; ze tellen dus niet mee in
 * het kassatotaal.
 */
export const VOUCHER_FIELDS = [
  { field: 'cnt_elixirbon', label: 'ElixIrbonnen' },
  { field: 'cnt_guidogids', label: 'Guidogids' },
  { field: 'cnt_medewerkersbon', label: 'Medewerkersbonnen' },
] as const;

export type CashCounts = Record<(typeof DENOMINATIONS)[number]['field'], number>;

/** Het getelde kassageld in cent. Bonnen tellen bewust niet mee. */
export function cashTotal(counts: Partial<CashCounts> | null | undefined): number {
  if (!counts) return 0;
  return DENOMINATIONS.reduce((total, denomination) => total + (counts[denomination.field] ?? 0) * denomination.cents, 0);
}

export const WEEKDAYS = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'] as const;

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit' }).format(date);
}
