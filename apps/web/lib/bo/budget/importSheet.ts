import { cellKey, cellText, readWorkbook, XlsxError, type Sheet } from '@/lib/praesidiumShifts/xlsx';
import { shopOfUrl } from '@/lib/priceCheck/shops';
import { figuresFromSheet, type Figures } from '../figures';
import { normalizeKey } from '../names';
import { overviewOf, resultOverviewOf, toCents, type CalcContext } from './calc';
import { newId } from './templates';
import {
  DEFAULT_SETTINGS,
  type BudgetContent,
  type CostRow,
  type CostSection,
  type IncomeRow,
  type IncomeSection,
  type Section,
  type Source,
} from './types';

/*
 * Een budget- of resultaatblad van het BO omzetten naar een budget op de site,
 * zodat wat al langs het BO passeerde ook op de site staat en de kring de site
 * met echte cijfers kan beoordelen.
 *
 * Het blad wordt gelezen zoals de scan het leest (`lib/bo/figures.ts`): de
 * laatst berekende waarde van elke cel, geen formules. Per sectie (de rij met
 * "Naam" in kolom B) wordt elke regel een regel op de site: naam, aantal,
 * prijs, het resultaat en de link uit "Opmerking/link".
 *
 * Wat hier bewust NIET gebeurt, is de berekening van het blad naspelen. Een
 * variabele regel (30 % × 150 deelnemers, per 24) komt binnen als haar
 * uitkomst: zoveel eenheden tegen die prijs, met de som van het blad in de
 * opmerking. Zo klopt elk bedrag met wat het BO goedkeurde, wat het blad ook
 * rekende. Wie het budget wil hergebruiken, bouwt de verdeling op de site.
 *
 * **Het totaal moet kloppen met het blad, tot op de cent.** Lukt dat niet met
 * de regels (het blad Fakfeestje, een budget over meer tabbladen, een eigen
 * indeling), dan valt de lezer terug op het blok Overzicht: één regel per
 * kostenpost, met het bedrag van het blad. Welke van de twee het werd, staat
 * in `content.source.mode`, en de nakijkweergave zegt het.
 *
 * Puur op een buffer: de bladen zelf komen nooit in de repo, de test bouwt er
 * een na.
 */

export type ImportMode = 'regels' | 'overzicht';

export type ImportedBudget = {
  content: BudgetContent;
  /** De post en de activiteit zoals het blad ze zelf noemt (A1 en C1). */
  sheetPost: string | null;
  sheetTitle: string | null;
  mode: ImportMode;
  /** Het totaal van het blad, en of er een resultaat in staat. */
  sheetTotalCents: number | null;
  hasResult: boolean;
  rows: number;
};

export type ImportError = 'UNREADABLE' | 'NO_OVERVIEW';

const ctx: CalcContext = { postKey: '', settings: DEFAULT_SETTINGS };

function num(sheet: Sheet, row: number, col: number): number | null {
  const v = sheet.cells.get(cellKey(row, col))?.value;
  return v?.kind === 'number' && Number.isFinite(v.value) ? v.value : null;
}

function text(sheet: Sheet, row: number, col: number): string {
  return cellText(sheet.cells.get(cellKey(row, col))).trim();
}

function key(sheet: Sheet, row: number, col: number): string {
  return normalizeKey(text(sheet, row, col));
}

const euro = (n: number) => Math.round(n * 100) / 100;

type Columns = { qty: number; price: number; total: number; result: number; note: number; last: number };

/** De kolommen van een sectie, uit haar koprij. */
function columnsOf(sheet: Sheet, row: number): Columns | null {
  const cols: Columns = { qty: 0, price: 0, total: 0, result: 0, note: 0, last: 0 };
  let amount = 0;
  for (let col = 3; col <= Math.min(sheet.maxCol, 24); col += 1) {
    const label = key(sheet, row, col);
    if (!label) continue;
    cols.last = col;
    // "Eenheden" wint van "Aantal": bij een variabele regel is dat wat er gekocht wordt.
    if (label === 'eenheden' || label === 'totaaleenheden' || label.startsWith('eenhedenpak')) cols.qty = col;
    else if (label.startsWith('aantal') && !cols.qty && !cols.total) amount = amount || col;
    else if (label.startsWith('prij') && !cols.total) cols.price = col;
    else if (label === 'totaal' && !cols.total) cols.total = col;
    else if (label.startsWith('resultaat') && !cols.result) cols.result = col;
    else if (label.startsWith('opmerking') && !cols.note) cols.note = col;
  }
  if (!cols.qty) cols.qty = amount;
  return cols.total ? cols : null;
}

function sourceOf(sheet: Sheet, row: number, cols: Columns): { source: Source | null; note: string } {
  // De link staat op "Opmerking/link", of op de naam van het product.
  let url: string | null = null;
  let note = '';
  for (let col = 2; col <= Math.max(cols.last, cols.note); col += 1) {
    const link = sheet.links.get(cellKey(row, col));
    if (link && !url && !/docs\.google\.com\/spreadsheets/.test(link)) url = link;
  }
  if (cols.note) {
    note = text(sheet, row, cols.note);
    const inText = /https?:\/\/\S+/.exec(note)?.[0];
    if (inText && !url) url = inText;
    if (inText) note = note.replace(inText, '').trim();
  }
  if (url) {
    const collectgo = shopOfUrl(url) === 'collectgo';
    return { source: { type: collectgo ? 'collectgo' : 'webshop', url: url.slice(0, 2000) }, note };
  }
  if (note) return { source: { type: 'afspraak', note: note.slice(0, 500) }, note: '' };
  return { source: null, note: '' };
}

/** De regels van het blad, sectie per sectie. Null wanneer het blad geen secties met "Naam" heeft. */
function sectionsFromRows(sheet: Sheet, figures: Figures, prefer: 'kopje' | 'overzicht'): Section[] | null {
  // Een naam die in het overzicht zowel inkomst als kost is ("Drank"), zegt niets: dan telt het kopje.
  const sideByName = new Map<string, 'in' | 'out' | null>();
  for (const line of figures.lines) {
    const name = normalizeKey(line.label);
    sideByName.set(name, sideByName.has(name) && sideByName.get(name) !== line.side ? null : line.side);
  }
  let sawGroup = false;
  const sections: Section[] = [];
  let group: 'in' | 'out' = 'out';
  let row = 1;
  let first = true;
  while (row <= sheet.maxRow) {
    const a = key(sheet, row, 1);
    if (!text(sheet, row, 2)) {
      if (a.startsWith('inkomsten')) group = 'in';
      else if (a.startsWith('vastekost') || a.startsWith('variabelekost')) {
        group = 'out';
        sawGroup = true;
      }
    }
    if (key(sheet, row, 2) !== 'naam') {
      row += 1;
      continue;
    }
    const cols = columnsOf(sheet, row);
    const name = text(sheet, row, 1) || (group === 'in' ? 'Inkomsten' : 'Kosten');
    if (!cols) {
      row += 1;
      continue;
    }
    // Het overzicht zegt van elke sectie of ze een inkomst of een kost is; anders het kopje erboven.
    if (first && sideByName.size === 0 && a.startsWith('inkom')) group = 'in';
    first = false;
    const byName = sideByName.get(normalizeKey(name)) ?? null;
    const side = prefer === 'kopje' && sawGroup ? group : (byName ?? group);
    const cost: CostRow[] = [];
    const income: IncomeRow[] = [];
    let blank = 0;
    for (row += 1; row <= sheet.maxRow && blank < 4; row += 1) {
      if (key(sheet, row, 2) === 'naam') break;
      const label = text(sheet, row, 2);
      if (!label) {
        // De rij "Totaal" sluit de sectie af.
        const closing = [3, 4, 5, 6, 7, 8].some((col) => key(sheet, row, col) === 'totaal');
        if (closing) {
          row += 1;
          break;
        }
        blank += text(sheet, row, 1) ? 4 : 1;
        continue;
      }
      blank = 0;
      const qty = cols.qty ? num(sheet, row, cols.qty) : null;
      const price = cols.price ? num(sheet, row, cols.price) : null;
      const result = cols.result ? num(sheet, row, cols.result) : null;
      const total = num(sheet, row, cols.total) ?? (qty != null && price != null ? qty * price : null);
      if ((total == null || Math.abs(total) < 0.0005) && (result == null || Math.abs(result) < 0.0005)) continue;
      const amount = euro(total ?? 0);
      const exact = qty != null && price != null && qty >= 0 && Math.abs(qty * price - (total ?? 0)) < 0.006;
      const { source, note } = sourceOf(sheet, row, cols);
      if (side === 'in') {
        income.push({
          id: newId(),
          name: label.slice(0, 200),
          count: { type: 'manual', qty: exact ? qty! : 1 },
          price: { type: 'manual', value: exact ? price! : amount },
          ...(source?.note || source?.url || note
            ? { note: [source?.note, source?.url, note].filter(Boolean).join(' ').slice(0, 1000) }
            : {}),
          ...(result != null ? { result: euro(result) } : {}),
        });
        continue;
      }
      cost.push({
        id: newId(),
        name: label.slice(0, 200),
        ...(exact
          ? { qty: qty!, price: price!, basis: null, source }
          : {
              forfait: {
                amount,
                reason: [
                  'Overgenomen uit het rekenblad',
                  qty != null && price != null ? `(${qty} × ${price} gaf daar ${amount})` : '',
                  source?.note ?? source?.url ?? '',
                ]
                  .filter(Boolean)
                  .join(' ')
                  .slice(0, 500),
              },
            }),
        ...(note ? { note: note.slice(0, 1000) } : {}),
        ...(result != null ? { result: euro(result) } : {}),
      });
    }
    if (side === 'in') {
      if (income.length) sections.push({ id: newId(), name: name.slice(0, 120), type: 'income', rows: income });
    } else if (cost.length) sections.push({ id: newId(), name: name.slice(0, 120), type: 'fixed', rows: cost });
  }
  return sections.length ? sections : null;
}

/** Eén regel per post uit het blok Overzicht: grof, maar altijd het bedrag van het blad. */
function sectionsFromOverview(figures: Figures, withResult: boolean): Section[] {
  const reason = 'Overgenomen uit het overzicht van het rekenblad; de regels staan in het blad zelf';
  const income: IncomeSection = { id: newId(), name: 'Inkomsten', type: 'income', rows: [] };
  const cost: CostSection = { id: newId(), name: 'Uitgaven', type: 'fixed', rows: [] };
  for (const line of figures.lines) {
    const amount = (line.budgetCents ?? 0) / 100;
    const result = line.resultCents == null ? {} : { result: line.resultCents / 100 };
    // Het blad Fakfeestje heeft geen regel "Inkomsten": elke post staat er als negatief bedrag.
    const isCost = line.side === 'out' || (amount <= 0 && (line.resultCents ?? 0) <= 0);
    if (isCost && line.side === 'in') {
      cost.rows.push({
        id: newId(),
        name: line.label.slice(0, 200),
        forfait: { amount: -amount, reason },
        ...(line.resultCents == null ? {} : { result: -line.resultCents / 100 }),
      });
      continue;
    }
    if (line.side === 'in')
      income.rows.push({
        id: newId(),
        name: line.label.slice(0, 200),
        count: { type: 'manual', qty: 1 },
        price: { type: 'manual', value: amount },
        note: reason,
        ...result,
      });
    else cost.rows.push({ id: newId(), name: line.label.slice(0, 200), forfait: { amount, reason }, ...result });
  }
  // Wat het overzicht optelt zonder er een post voor te tonen, mag niet verdwijnen.
  const haveBudget =
    income.rows.reduce((sum, r) => sum + (r.price.type === 'manual' ? r.price.value : 0), 0) -
    cost.rows.reduce((sum, r) => sum + (r.forfait?.amount ?? 0), 0);
  const haveResult =
    income.rows.reduce((sum, r) => sum + (r.result ?? 0), 0) - cost.rows.reduce((sum, r) => sum + (r.result ?? 0), 0);
  const missBudget = figures.budgetTotalCents == null ? 0 : figures.budgetTotalCents / 100 - haveBudget;
  const missResult = figures.resultTotalCents == null || !withResult ? 0 : figures.resultTotalCents / 100 - haveResult;
  if (Math.abs(missBudget) > 0.009 || Math.abs(missResult) > 0.009) {
    cost.rows.push({
      id: newId(),
      name: 'Niet uitgesplitst in het overzicht',
      forfait: { amount: euro(-missBudget), reason },
      ...(withResult ? { result: euro(-missResult) } : {}),
    });
  }
  return [income, cost].filter((s) => s.rows.length > 0);
}

/**
 * Zet het resultaat van het overzicht per sectie: de resultaten per regel
 * vervallen, en één regel draagt wat het blad voor de hele sectie invulde.
 * Lukt enkel wanneer elke sectie één keer in het overzicht staat.
 */
function resultPerSection(content: BudgetContent, figures: Figures): boolean {
  const reason = 'In het rekenblad staat het resultaat per sectie, niet per regel';
  const used = new Set<number>();
  for (const section of content.sections) {
    const side = section.type === 'income' ? 'in' : 'out';
    const index = figures.lines.findIndex(
      (line, i) => !used.has(i) && line.side === side && normalizeKey(line.label) === normalizeKey(section.name)
    );
    if (index < 0) return false;
    used.add(index);
    const result = (figures.lines[index].resultCents ?? 0) / 100;
    for (const row of section.rows) delete row.result;
    const name = 'Resultaat van de sectie';
    if (section.type === 'income')
      section.rows.push({
        id: newId(),
        name,
        count: { type: 'manual', qty: 0 },
        price: { type: 'manual', value: 0 },
        note: reason,
        result,
      });
    else section.rows.push({ id: newId(), name, forfait: { amount: 0, reason }, result });
  }
  return true;
}

function find(sheet: Sheet, label: string, maxRow = 30): { row: number; col: number } | null {
  for (let row = 1; row <= Math.min(maxRow, sheet.maxRow); row += 1)
    for (let col = 1; col <= Math.min(sheet.maxCol, 24); col += 1)
      if (key(sheet, row, col) === label) return { row, col };
  return null;
}

export function importBudgetWorkbook(
  buffer: Buffer,
  meta: { fileName: string; kind: 'drive' | 'upload'; fileId?: string }
): ImportedBudget | { error: ImportError } {
  let sheets: Sheet[];
  try {
    sheets = readWorkbook(buffer).sheets;
  } catch (err) {
    if (err instanceof XlsxError || err instanceof RangeError) return { error: 'UNREADABLE' };
    throw err;
  }
  let sheet: Sheet | null = null;
  let figures: Figures | null = null;
  for (const candidate of sheets) {
    if (candidate.hidden) continue;
    figures = figuresFromSheet(candidate);
    if (figures) {
      sheet = candidate;
      break;
    }
  }
  if (!sheet || !figures) return { error: 'NO_OVERVIEW' };

  const persons = find(sheet, 'aantalpersonen');
  const concept = find(sheet, 'concept');
  // Enkel een geloofwaardig aantal: naast "Aantal personen" staat soms iets anders.
  const rawPersons = (persons && num(sheet, persons.row, persons.col + 1)) || 0;
  const personCount = rawPersons > 0 && rawPersons <= 100_000 ? rawPersons : 0;
  const share = figures.vtkSharePercent;
  const hasResult =
    (figures.resultTotalCents != null && figures.resultTotalCents !== 0) ||
    figures.lines.some((line) => (line.resultCents ?? 0) !== 0);
  const base = (sections: Section[], mode: ImportMode): BudgetContent => ({
    version: 1,
    params: { persons: personCount },
    info: {
      date: figures.eventDate ? figures.eventDate.toISOString().slice(0, 10) : '',
      location: (figures.location ?? '').slice(0, 120),
      concept: (concept ? text(sheet, concept.row + 1, concept.col) : '').slice(0, 2000),
    },
    begroting: figures.allocationCents == null ? null : figures.allocationCents / 100,
    vat: null,
    allocation:
      share != null && share > 0 && share < 100
        ? [
            { org: 'VTK', share: share / 100 },
            { org: 'Andere', share: 1 - share / 100 },
          ]
        : [{ org: 'VTK', share: 1 }],
    sections,
    ...(hasResult ? { result: { on: true } } : {}),
    source: {
      kind: meta.kind,
      name: meta.fileName.slice(0, 300),
      ...(meta.fileId ? { id: meta.fileId.slice(0, 200) } : {}),
      mode,
      sheetTotal: figures.budgetTotalCents == null ? null : figures.budgetTotalCents / 100,
    },
  });

  const matchesBudget = (content: BudgetContent) =>
    figures.budgetTotalCents == null ||
    Math.abs(toCents(overviewOf(content, ctx).total) - figures.budgetTotalCents) <= 1;
  const matches = (content: BudgetContent) => {
    if (!matchesBudget(content)) return false;
    if (hasResult && figures.resultTotalCents != null) {
      const result = toCents(resultOverviewOf(content, ctx).total);
      if (Math.abs(result - figures.resultTotalCents) > 1) return false;
    }
    return true;
  };

  // Twee lezingen van welke sectie een inkomst is; de eerste die op het totaal van het blad uitkomt, telt.
  let content: BudgetContent | null = null;
  for (const prefer of ['kopje', 'overzicht'] as const) {
    const rows = sectionsFromRows(sheet, figures, prefer);
    if (!rows) break;
    const candidate = base(rows, 'regels');
    if (matches(candidate)) {
      content = candidate;
      break;
    }
    // Het budget klopt, het resultaat niet: het blad vulde het resultaat per sectie in, niet per regel.
    if (hasResult && matchesBudget(candidate) && resultPerSection(candidate, figures) && matches(candidate)) {
      content = candidate;
      break;
    }
  }
  if (!content) content = base(sectionsFromOverview(figures, hasResult), 'overzicht');
  return {
    content,
    sheetPost: figures.sheetPost,
    sheetTitle: figures.sheetTitle,
    mode: content.source!.mode,
    sheetTotalCents: figures.budgetTotalCents,
    hasResult,
    rows: content.sections.reduce((n, s) => n + s.rows.length, 0),
  };
}
