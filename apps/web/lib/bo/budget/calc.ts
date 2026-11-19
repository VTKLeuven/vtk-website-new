import type {
  Audience,
  BudgetContent,
  BudgetLocation,
  BudgetSettings,
  CostRow,
  CostSection,
  IncomeRow,
  LocationField,
  Section,
} from './types';

/*
 * Rekenen zoals de bladen van de penning, maar zonder formules om stuk te
 * maken. Puur, zodat het getest kan worden tegen echte budgetten van het BO
 * (test/boBudget.test.ts rekent Live Cantus, IT Nieuw Materiaal en PeMe
 * Silent-Disco van BO 12 tot op de cent na).
 *
 * BTW: een prijs excl. BTW telt als prijs × (1 + tarief van de post). Een
 * winkelprijs (incl.) wordt eerst gedeeld door (1 + tarief van het product).
 * Zo deden de bladen het met de hand: Bedrijvenrelaties `=1.85/1.06`, IT
 * `=(119/1.21)*1.105`, Cultuur `=SUM(...)*1.21`. Zolang Beheer voor een post
 * geen tarief invulde, telt elke prijs zoals ingetypt, zoals vandaag.
 */

export type CalcContext = {
  /** De sleutel van de post, voor het tarief. */
  postKey: string;
  settings: BudgetSettings;
  /**
   * De andere budgetten op dezelfde begrotingslijn (`pot.ts`): hun totalen
   * samen. Met een potje vergelijkt het overzicht de som met de begroting.
   */
  pot?: { others: number; othersResult: number; count: number } | null;
};

export function isIncome(section: Section): section is Extract<Section, { type: 'income' }> {
  return section.type === 'income';
}

export function costSections(content: BudgetContent): CostSection[] {
  return content.sections.filter((s): s is CostSection => s.type !== 'income');
}

export function allCostRows(content: BudgetContent): CostRow[] {
  return costSections(content).flatMap((s) => s.rows);
}

export function findCostRow(content: BudgetContent, id: string): { row: CostRow; section: CostSection } | null {
  for (const section of costSections(content)) {
    const row = section.rows.find((r) => r.id === id);
    if (row) return { row, section };
  }
  return null;
}

/* ---------------------------------------------------------------- BTW */

/** Het tarief waarmee dit budget rekent, of null wanneer het nog niet ingevuld is. */
export function rateOf(content: BudgetContent, ctx: CalcContext): number | null {
  if (content.vat) return content.vat.rate;
  const rate = ctx.settings.vatByPost[ctx.postKey];
  return typeof rate === 'number' ? rate : null;
}

export function locationOf(content: BudgetContent, ctx: CalcContext): BudgetLocation | null {
  const name = content.info.location.trim().toLowerCase();
  if (!name) return null;
  return ctx.settings.locations.find((l) => l.name.trim().toLowerCase() === name) ?? null;
}

/** De prijs van de zaal voor een veld, met de Collect&Go-sangria als de zaal er geen heeft. */
export function locationValue(content: BudgetContent, ctx: CalcContext, field: LocationField): number | null {
  const location = locationOf(content, ctx);
  if (!location) return null;
  const value = location[field];
  if (field === 'sangria' && value == null) return ctx.settings.sangriaFallback;
  return value;
}

/** De prijs zoals hij voor deze regel ingetypt of opgehaald is, nog zonder BTW-omrekening. */
export function priceOf(content: BudgetContent, ctx: CalcContext, row: CostRow): number {
  if (row.service) return ctx.settings.serviceCost;
  if (row.source?.type === 'locatie' && row.source.field) {
    if (row.override != null) return row.override;
    return locationValue(content, ctx, row.source.field) ?? 0;
  }
  return row.price ?? 0;
}

/** Incl. of excl., en tegen welk producttarief. Null = niemand koos het. */
export function basisOf(
  content: BudgetContent,
  ctx: CalcContext,
  row: CostRow
): { basis: 'incl' | 'excl' | null; productVat: number } {
  if (row.service) return { basis: 'incl', productVat: 0.21 };
  if (row.source?.type === 'locatie' && row.override == null) {
    const location = locationOf(content, ctx);
    // De Collect&Go-sangria is een winkelprijs; de prijzen van een zaal volgen de keuze bij die zaal.
    if (row.source.field === 'sangria' && location && location.sangria == null)
      return { basis: 'incl', productVat: 0.21 };
    return { basis: location?.basis ?? null, productVat: 0.21 };
  }
  return { basis: row.basis ?? null, productVat: row.productVat ?? 0.21 };
}

export type UnitAmount =
  | { mode: 'norate'; amount: number; price: number }
  | { mode: 'nobasis'; amount: number; price: number; rate: number }
  | {
      mode: 'calc';
      amount: number;
      price: number;
      rate: number;
      excl: number;
      basis: 'incl' | 'excl';
      productVat: number;
    };

/** Wat één stuk of één eenheid in het budget kost. */
export function unitAmount(content: BudgetContent, ctx: CalcContext, row: CostRow, price?: number): UnitAmount {
  const p = price ?? priceOf(content, ctx, row);
  const rate = rateOf(content, ctx);
  if (rate === null) return { mode: 'norate', amount: p, price: p };
  const { basis, productVat } = basisOf(content, ctx, row);
  if (!basis) return { mode: 'nobasis', amount: p, price: p, rate };
  const excl = basis === 'incl' ? p / (1 + productVat) : p;
  return { mode: 'calc', amount: excl * (1 + rate), price: p, rate, excl, basis, productVat };
}

/* ---------------------------------------------------------- Verdeling */

export type DistributionPart = { rowId: string; name: string; pct: number; mixWith: string[] };
export type Distribution = {
  parts: DistributionPart[];
  /** Som van de delen, zonder de rest. */
  sum: number;
  /** De regel die de rest krijgt, als die er is. */
  restRow: CostRow | null;
  /** Wat de rest krijgt: 1 - som, nooit minder dan 0. */
  rest: number;
  ok: boolean;
};

/**
 * De verdeling van een variabele sectie. Een mix telt één keer (Mimosa is Cava
 * en Fruitsap), en een rest vult aan tot 100 %. Zonder rest moet de som
 * precies 100 % zijn. Gewoon alle percentages optellen gaf in BO 12 drie keer
 * vals alarm: Live Cantus 89,25 %, FIESTA I 200 % en PeMe 114 % klopten alle drie.
 */
export function distributionOf(section: CostSection): Distribution {
  const parts: DistributionPart[] = [];
  let restRow: CostRow | null = null;
  for (const row of section.rows) {
    if (row.rest) {
      restRow = restRow ?? row;
      continue;
    }
    if (row.mixOf && section.rows.some((r) => r.id === row.mixOf)) continue;
    parts.push({
      rowId: row.id,
      name: row.name,
      pct: row.pct ?? 0,
      mixWith: section.rows.filter((r) => r.mixOf === row.id).map((r) => r.name),
    });
  }
  const sum = parts.reduce((total, p) => total + p.pct, 0);
  const left = 1 - sum;
  const ok = restRow ? left > -1e-9 : Math.abs(left) < 1e-9;
  return { parts, sum, restRow, rest: Math.max(0, left), ok };
}

/** Het aandeel van een regel in haar verdeling (een mix neemt dat van haar partner). */
export function rowPct(section: CostSection, row: CostRow): number {
  if (!section.distribute) return 1;
  if (row.rest) return distributionOf(section).rest;
  if (row.mixOf) {
    const partner = section.rows.find((r) => r.id === row.mixOf);
    if (partner) return partner.pct ?? 0;
  }
  return row.pct ?? 0;
}

export function perPersonOf(section: CostSection, row: CostRow): number {
  return row.perPerson ?? section.perPerson ?? 1;
}

/** Voor hoeveel personen een variabele sectie rekent: haar eigen aantal, of de deelnemers. */
export function baseOf(content: BudgetContent, section: CostSection): number {
  return section.base ?? (content.params.persons || 0);
}

/** Hoeveel er gedronken of gegeten wordt, voor de afronding. */
export function consumptionOf(content: BudgetContent, section: CostSection, row: CostRow): number {
  return (section.share ?? 1) * rowPct(section, row) * baseOf(content, section) * perPersonOf(section, row);
}

/** Hoeveel eenheden de regel koopt: altijd naar boven afgerond, zoals ROUNDUP in het blad. */
export function unitsOf(content: BudgetContent, section: CostSection, row: CostRow): number {
  if (section.type === 'fixed' || row.forfait) return row.qty ?? 0;
  if (row.rest || !row.perUnit) return 0;
  return Math.max(0, Math.ceil(consumptionOf(content, section, row) / row.perUnit - 1e-9));
}

/** Eenheden die bij Collect&Go besteld moeten worden: wat niet uit Flesserke komt. */
export function orderUnits(content: BudgetContent, section: CostSection, row: CostRow): number {
  return Math.max(0, unitsOf(content, section, row) - (row.flesserke ?? 0));
}

/** Wat een kostregel in het budget kost. */
export function costAmount(content: BudgetContent, ctx: CalcContext, section: CostSection, row: CostRow): number {
  if (row.forfait) return row.forfait.amount || 0;
  if (row.rest) return 0;
  const units = ctx.settings.flesserkeCounts ? unitsOf(content, section, row) : orderUnits(content, section, row);
  return units * unitAmount(content, ctx, row).amount;
}

/* ---------------------------------------------------------- Inkomsten */

/**
 * Een cantus: leden betalen, ereleden niet, genodigden komen uit de
 * praesesbegroting. Zelfde formules als het cantusblad van Activiteiten:
 * leden = ⌊totaal × (leden% − ereleden%)⌋ − genodigden,
 * niet-leden = ⌈totaal × (1 − betalende leden% − ereleden%)⌉,
 * ereleden = ⌈deelnemers × ereleden%⌉.
 */
export function audienceCount(content: BudgetContent, audience: Audience): number {
  const p = content.params;
  const persons = p.persons || 0;
  const guests = p.guests || 0;
  const total = persons + guests;
  const honorary = p.honoraryShare || 0;
  const paying = (p.memberShare || 0) - honorary;
  switch (audience) {
    case 'leden':
      return Math.max(0, Math.floor(total * paying + 1e-9) - guests);
    case 'nietleden':
      return Math.max(0, Math.ceil(total * (1 - paying - honorary) - 1e-9));
    case 'ereleden':
      return Math.max(0, Math.ceil(persons * honorary - 1e-9));
    case 'genodigden':
      return guests;
  }
}

export function incomeCount(content: BudgetContent, row: IncomeRow): number {
  const c = row.count;
  if (c.type === 'manual') return c.qty || 0;
  if (c.type === 'audience') return audienceCount(content, c.audience);
  const found = findCostRow(content, c.rowId);
  if (!found) return 0;
  if (c.type === 'units') return unitsOf(content, found.section, found.row);
  return Math.floor(consumptionOf(content, found.section, found.row) + 1e-9);
}

/** Het aandeel van de rest in een verdeling (wie water drinkt). */
export function restShare(content: BudgetContent, sectionId: string): number {
  const section = costSections(content).find((s) => s.id === sectionId);
  if (!section || !section.distribute) return 0;
  const d = distributionOf(section);
  return d.restRow ? d.rest : 0;
}

export function incomePrice(content: BudgetContent, row: IncomeRow): number {
  const p = row.price;
  if (p.type === 'manual') return p.value || 0;
  const rest = restShare(content, p.sectionId);
  return (1 - rest) * (p.main || 0) + rest * (p.rest || 0);
}

export function incomeAmount(content: BudgetContent, row: IncomeRow): number {
  return incomeCount(content, row) * incomePrice(content, row);
}

/* ---------------------------------------------------------- Overzicht */

export type OverviewLine = { id: string; name: string; side: 'in' | 'out'; amount: number };
export type Overview = {
  lines: OverviewLine[];
  income: number;
  expense: number;
  /** Inkomsten min uitgaven: een kost is negatief, zoals in het blad. */
  total: number;
  begroting: number | null;
  /** Totaal min begroting: positief is beter dan gepland. */
  diff: number | null;
};

export function sectionAmount(content: BudgetContent, ctx: CalcContext, section: Section): number {
  if (section.type === 'income') return section.rows.reduce((sum, row) => sum + incomeAmount(content, row), 0);
  return section.rows.reduce((sum, row) => sum + costAmount(content, ctx, section, row), 0);
}

export function overviewOf(content: BudgetContent, ctx: CalcContext): Overview {
  const lines: OverviewLine[] = content.sections.map((section) => ({
    id: section.id,
    name: section.name,
    side: section.type === 'income' ? 'in' : 'out',
    amount: sectionAmount(content, ctx, section),
  }));
  const income = lines.filter((l) => l.side === 'in').reduce((s, l) => s + l.amount, 0);
  const expense = lines.filter((l) => l.side === 'out').reduce((s, l) => s + l.amount, 0);
  const total = income - expense;
  const begroting = content.begroting;
  // Een potje: wat de andere budgetten op dezelfde lijn al namen, telt mee.
  const others = ctx.pot?.others ?? 0;
  return { lines, income, expense, total, begroting, diff: begroting == null ? null : total + others - begroting };
}

/** Een bedrag in centen, zoals de lijst het bewaart: de helft weg van nul, zoals Sheets. */
export function toCents(amount: number): number {
  return Math.sign(amount) * Math.round(Math.abs(amount) * 100 + 1e-7);
}

/* ---------------------------------------------------------- Resultaat */

export function hasResult(content: BudgetContent): boolean {
  return !!content.result?.on;
}

/** Wat een sectie echt opbracht of kostte: de som van de ingevulde resultaten. */
export function sectionResult(section: Section): number {
  return section.rows.reduce((sum, row) => sum + (row.result ?? 0), 0);
}

/** Hoeveel regels met een bedrag nog geen resultaat hebben. */
export function missingResults(content: BudgetContent, ctx: CalcContext): number {
  let missing = 0;
  for (const section of content.sections) {
    for (const row of section.rows) {
      if (row.result != null) continue;
      const amount =
        section.type === 'income'
          ? incomeAmount(content, row as IncomeRow)
          : costAmount(content, ctx, section, row as CostRow);
      if (Math.abs(amount) > 0.004) missing += 1;
    }
  }
  return missing;
}

export type ResultOverview = {
  lines: OverviewLine[];
  income: number;
  expense: number;
  total: number;
  /** Resultaat min budget: positief is beter dan gebudgetteerd. */
  diffBudget: number;
  /** Resultaat min begroting. */
  diffBegroting: number | null;
};

export function resultOverviewOf(content: BudgetContent, ctx: CalcContext): ResultOverview {
  const lines: OverviewLine[] = content.sections.map((section) => ({
    id: section.id,
    name: section.name,
    side: section.type === 'income' ? 'in' : 'out',
    amount: sectionResult(section),
  }));
  const income = lines.filter((l) => l.side === 'in').reduce((s, l) => s + l.amount, 0);
  const expense = lines.filter((l) => l.side === 'out').reduce((s, l) => s + l.amount, 0);
  const total = income - expense;
  const budget = overviewOf(content, ctx).total;
  return {
    lines,
    income,
    expense,
    total,
    diffBudget: total - budget,
    diffBegroting: content.begroting == null ? null : total + (ctx.pot?.othersResult ?? 0) - content.begroting,
  };
}
