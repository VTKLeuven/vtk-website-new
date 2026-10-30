/**
 * De boekhoudcodes uit een CSV lezen en vergelijken met het register, voor
 * `/admin/boekhoudcodes`. Puur: geen database (`test/accountingCodesImport.test.ts`).
 *
 * De lijst van de penning staat in een rekenblad; dit laat haar die als CSV
 * opladen in plaats van elke code met de hand in te tikken. Een code die niet
 * meer in het bestand staat, wordt nooit vanzelf verwijderd: ticketverkopen en
 * bestellingen hangen eraan.
 */
import { detectDelimiter, parseCsv } from "@/lib/csv";
import { MAX_ACCOUNTING_NAME, normalizeCodeInput, parseMainCode, parseSubSuffix, subCode } from "./codes";

export type CodeFileRow = { line: number; main: string; sub: string | null; name: string };

export type CodeFileError = { line: number; message: string };

export type CodeFileResult =
  | { ok: true; rows: CodeFileRow[]; errors: CodeFileError[] }
  | { ok: false; error: "EMPTY" | "COLUMNS" };

/** Kolomnamen die we herkennen, in kleine letters. */
const MAIN_NAMES = ["boekhoudcode", "code", "hoofdrekening", "rekening", "grootboekrekening", "account", "accounting code"];
const SUB_NAMES = ["subcode", "analytische code", "analytisch", "analytic", "analytic code", "analytische rekening"];
const NAME_NAMES = ["naam", "omschrijving", "benaming", "name", "description", "post"];

/**
 * Lees de rijen. De eerste rij moet de kolomnamen hebben: een kolom voor de
 * code, optioneel een voor de subcode, en een voor de naam. Staat de subcode in
 * dezelfde cel als de code ("700120 12002", of aaneen), dan lezen we die ook.
 */
export function parseAccountingCodesCsv(text: string): CodeFileResult {
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) return { ok: false, error: "EMPTY" };
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  // In de volgorde van de lijst: heeft het blad een kolom "Post" én "Naam", dan wint "Naam".
  const find = (names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index !== -1) return index;
    }
    return -1;
  };
  const mainCol = find(MAIN_NAMES);
  const subCol = find(SUB_NAMES);
  const nameCol = find(NAME_NAMES);
  if (mainCol === -1 || nameCol === -1) return { ok: false, error: "COLUMNS" };

  const result: CodeFileRow[] = [];
  const errors: CodeFileError[] = [];
  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const raw = rows[i];
    const mainRaw = (raw[mainCol] ?? "").trim();
    const subRaw = subCol === -1 ? "" : (raw[subCol] ?? "").trim();
    const name = (raw[nameCol] ?? "").trim().replace(/\s+/g, " ");
    if (!mainRaw && !subRaw && !name) continue;

    // "700120 12002" of "70012012002" in één cel.
    const digits = normalizeCodeInput(mainRaw);
    const inline = !subRaw && /^\d{11}$/.test(digits) ? { main: digits.slice(0, 6), sub: digits.slice(6) } : null;
    const main = parseMainCode(inline?.main ?? mainRaw);
    if (!main) {
      errors.push({ line, message: `"${mainRaw}" is geen hoofdrekening van zes cijfers` });
      continue;
    }
    let sub: string | null = null;
    const subText = inline?.sub ?? subRaw;
    if (subText) {
      sub = parseSubSuffix(subText, main);
      if (!sub) {
        errors.push({ line, message: `"${subText}" is geen subcode van vijf cijfers` });
        continue;
      }
    }
    if (!name) {
      errors.push({ line, message: "de naam ontbreekt" });
      continue;
    }
    result.push({ line, main, sub, name: name.slice(0, MAX_ACCOUNTING_NAME) });
  }
  return { ok: true, rows: result, errors };
}

export type ExistingCode = { id: string; code: string; name: string; parentId: string | null };

export type CodeImportPlan = {
  /** Nieuwe codes, hoofdrekeningen eerst. */
  create: Array<{ code: string; name: string; parentCode: string | null }>;
  rename: Array<{ code: string; from: string; to: string }>;
  unchanged: number;
  /** In het register, niet in het bestand: blijft staan. */
  missing: Array<{ code: string; name: string }>;
  errors: CodeFileError[];
  /** Elke code van het bestand, in de volgorde van het bestand. */
  order: string[];
  /**
   * Of de volgorde van het bestand die van het register wordt: enkel als het
   * bestand de hele lijst bevat. Een bestand met een paar codes zou anders de
   * volgorde van de rest door elkaar schudden; dan komen nieuwe codes achteraan.
   */
  reorder: boolean;
};

/** Wat opladen zou doen. Bevat `errors` iets, dan laadt de site niets op. */
export function planAccountingCodeImport(file: { rows: CodeFileRow[]; errors: CodeFileError[] }, existing: readonly ExistingCode[]): CodeImportPlan {
  const byCode = new Map(existing.map((code) => [code.code, code]));
  const errors = [...file.errors];
  const seen = new Map<string, number>();
  const create: CodeImportPlan["create"] = [];
  const rename: CodeImportPlan["rename"] = [];
  const order: string[] = [];
  let unchanged = 0;

  const mainsInFile = new Set(file.rows.filter((row) => !row.sub).map((row) => row.main));
  for (const row of file.rows) {
    const code = row.sub ? subCode(row.main, row.sub) : row.main;
    const earlier = seen.get(code);
    if (earlier !== undefined) {
      errors.push({ line: row.line, message: `${code} staat er al op regel ${earlier}` });
      continue;
    }
    seen.set(code, row.line);
    if (row.sub && !mainsInFile.has(row.main) && !byCode.has(row.main)) {
      errors.push({ line: row.line, message: `de hoofdrekening ${row.main} van ${code} staat niet in het bestand en niet in het register` });
      continue;
    }
    order.push(code);
    const current = byCode.get(code);
    if (!current) create.push({ code, name: row.name, parentCode: row.sub ? row.main : null });
    else if (current.name !== row.name) rename.push({ code, from: current.name, to: row.name });
    else unchanged += 1;
  }

  create.sort((a, b) => (a.parentCode ? 1 : 0) - (b.parentCode ? 1 : 0));
  const inFile = new Set(order);
  const missing = existing.filter((code) => !inFile.has(code.code)).map((code) => ({ code: code.code, name: code.name }));
  errors.sort((a, b) => a.line - b.line);
  return { create, rename, unchanged, missing, errors, order, reorder: missing.length === 0 };
}
