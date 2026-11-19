import { cellKey, cellText, readWorkbook, XlsxError, type Sheet } from '@/lib/praesidiumShifts/xlsx';
import { normalizeKey } from '../names';

/*
 * De begroting van het werkingsjaar, uit het rekenblad van Beheer
 * ("Begroting 2026-2027.xlsx"). Per post een tabblad met dezelfde kop op rij 4:
 * Beschrijving, Aantal, Eenheidsbedrag, ..., Totaal. Een rij met een aantal of
 * een eenheidsbedrag is een lijn; een rij met enkel een beschrijving (en soms
 * een som) is een kopje boven de lijnen eronder.
 *
 * De site leest het bestand wanneer Groep 5 het oplaadt bij de instellingen en
 * bewaart enkel de lijnen (`Setting` "bestuursorgaan.begroting"). Zo kiest een
 * post bij haar budget de lijn uit de begroting in plaats van het bedrag over
 * te typen, en weet de site welke budgetten samen op dezelfde lijn zitten (een
 * potje, zie `pot.ts`). In de code staat geen enkele lijn en geen enkel bedrag.
 *
 * Tabbladen zonder die kop (Overzicht, Fakbar Drank, Theokaart) slaat de
 * lezer over. Puur op een buffer, zodat het getest kan worden.
 */

export type BegrotingLine = {
  /** Stabiel binnen een tabblad: kopje en naam, genormaliseerd; een tweede keer dezelfde krijgt "#2". */
  key: string;
  group: string;
  name: string;
  /** Het totaal van de lijn in euro; een kost is negatief, zoals in het blad. */
  amount: number;
};

export type BegrotingSheet = { name: string; lines: BegrotingLine[] };

export type Begroting = {
  fileName: string;
  uploadedAt: string;
  sheets: BegrotingSheet[];
};

export type BegrotingRef = { sheet: string; key: string; label: string };

function num(sheet: Sheet, row: number, col: number): number | null {
  const v = sheet.cells.get(cellKey(row, col))?.value;
  return v?.kind === 'number' && Number.isFinite(v.value) ? v.value : null;
}

function text(sheet: Sheet, row: number, col: number): string {
  return cellText(sheet.cells.get(cellKey(row, col))).trim();
}

/** Zoekt de kop: de rij waar "Beschrijving" staat, en in welke kolommen. */
function findHeader(sheet: Sheet): { row: number; name: number; qty: number; unit: number; total: number } | null {
  for (let row = 1; row <= Math.min(12, sheet.maxRow); row += 1) {
    const cols = new Map<string, number>();
    for (let col = 1; col <= Math.min(14, sheet.maxCol); col += 1) {
      const label = normalizeKey(text(sheet, row, col));
      if (label && !cols.has(label)) cols.set(label, col);
    }
    const name = cols.get('beschrijving');
    const total = cols.get('totaal');
    if (name && total) {
      return { row, name, total, qty: cols.get('aantal') ?? 0, unit: cols.get('eenheidsbedrag') ?? 0 };
    }
  }
  return null;
}

export function begrotingSheets(buffer: Buffer): BegrotingSheet[] | { error: 'UNREADABLE' | 'NO_LINES' } {
  let sheets: Sheet[];
  try {
    sheets = readWorkbook(buffer).sheets;
  } catch (err) {
    if (err instanceof XlsxError) return { error: 'UNREADABLE' };
    throw err;
  }
  const out: BegrotingSheet[] = [];
  for (const sheet of sheets) {
    if (sheet.hidden || /^template$/i.test(sheet.name.trim())) continue;
    const head = findHeader(sheet);
    if (!head) continue;
    const lines: BegrotingLine[] = [];
    const seen = new Map<string, number>();
    let group = '';
    let blank = 0;
    for (let row = head.row + 1; row <= sheet.maxRow && blank < 40; row += 1) {
      const name = text(sheet, row, head.name);
      if (!name) {
        blank += 1;
        continue;
      }
      blank = 0;
      const total = num(sheet, row, head.total);
      const isLine =
        (head.qty && num(sheet, row, head.qty) != null) || (head.unit && num(sheet, row, head.unit) != null);
      if (!isLine) {
        // Een kopje. Draagt het zelf een bedrag en volgt er geen lijn, dan is het zelf de lijn.
        group = name;
        const next = text(sheet, row + 1, head.name);
        const nextIsLine =
          !!next &&
          ((head.qty && num(sheet, row + 1, head.qty) != null) ||
            (head.unit && num(sheet, row + 1, head.unit) != null));
        if (total == null || nextIsLine) continue;
      }
      if (total == null) continue;
      const base = `${normalizeKey(isLine ? group : '')}/${normalizeKey(name)}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      lines.push({
        key: count > 1 ? `${base}#${count}` : base,
        group: isLine ? group : '',
        name,
        amount: Math.round(total * 100) / 100,
      });
    }
    if (lines.length > 0) out.push({ name: sheet.name.trim(), lines });
  }
  return out.length > 0 ? out : { error: 'NO_LINES' };
}

export function findBegrotingLine(
  begroting: Begroting | null,
  ref: BegrotingRef | null | undefined
): BegrotingLine | null {
  if (!begroting || !ref) return null;
  const sheet = begroting.sheets.find((s) => s.name === ref.sheet);
  return sheet?.lines.find((l) => l.key === ref.key) ?? null;
}

/** Het tabblad dat bij een post hoort, op naam ("Financieel Beheer" voor Beheer lukt niet altijd: dan kiest de post zelf). */
export function sheetForPost(begroting: Begroting | null, postName: string): string | null {
  if (!begroting) return null;
  const want = normalizeKey(postName);
  if (!want) return null;
  const exact = begroting.sheets.find((s) => normalizeKey(s.name) === want);
  if (exact) return exact.name;
  const loose = begroting.sheets.find((s) => {
    const have = normalizeKey(s.name);
    return have.length >= 4 && (have.startsWith(want) || want.startsWith(have));
  });
  return loose?.name ?? null;
}
