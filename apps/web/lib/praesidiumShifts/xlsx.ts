import { inflateRawSync } from "node:zlib";

/*
 * Een kleine xlsx-lezer, voor de shiftenlijsten van het praesidium. Ook de
 * budgetten en resultaten van het Bestuursorgaan lopen erdoor
 * (`lib/bo/figures.ts`); die hebben enkel de waarden nodig.
 *
 * Bestaat omdat de shiftenlijst zelf in de opmaak zit: welke kring een vakje
 * moet vullen, staat in de achtergrondkleur, en een shift van twee uur is een
 * samengevoegde cel over twee kolommen van een uur. `read-excel-file` (in de
 * uitleendienst) geeft enkel waarden terug, geen vulkleur en geen
 * samengevoegde cellen. Een volledige bibliotheek erbij halen betekent een
 * nieuwe dependency en een lockfile opnieuw laten oplossen (zie AGENTS.md),
 * voor iets wat in een paar honderd regels past: een xlsx is een zip met wat
 * XML erin, en `node:zlib` pakt die uit.
 *
 * Leest enkel wat de analyse nodig heeft: tekst, getallen, datums, booleans,
 * de vulkleur van elke cel, samengevoegde bereiken en welke tabbladen verborgen
 * zijn. Formules komen binnen als hun laatst berekende waarde.
 */

export type CellValue =
  | { kind: "text"; text: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: Date }
  | { kind: "bool"; value: boolean };

export type Cell = {
  row: number;
  col: number;
  value: CellValue;
  /** Achtergrondkleur als `RRGGBB` in hoofdletters, of null zonder vulling. */
  fill: string | null;
};

export type MergeRange = { r1: number; c1: number; r2: number; c2: number };

export type Sheet = {
  name: string;
  hidden: boolean;
  /** Elke cel die een waarde óf een vulkleur heeft, op `cellKey(row, col)`. */
  cells: Map<number, Cell>;
  merges: MergeRange[];
  maxRow: number;
  maxCol: number;
};

export type Workbook = { sheets: Sheet[] };

export class XlsxError extends Error {}

/** Grenzen tegen een kapot of kwaadwillig bestand; een shiftenlijst is een paar MB. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

export function cellKey(row: number, col: number): number {
  return row * 20_000 + col;
}

/** `"AB12"` -> `{ row: 12, col: 28 }` (1-gebaseerd, zoals in Excel). */
export function parseRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Z]{1,3})(\d+)$/.exec(ref);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(match[2]), col };
}

/** `(12, 28)` -> `"AB12"`. */
export function formatRef(row: number, col: number): string {
  let letters = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row}`;
}

/** Leesbare tekst van een cel, zoals een mens ze in de spreadsheet ziet. */
export function cellText(cell: Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value;
  switch (v.kind) {
    case "text":
      return v.text;
    case "number":
      return Number.isInteger(v.value) ? String(v.value) : String(v.value);
    case "date":
      return v.value.toISOString().slice(0, 10);
    case "bool":
      return v.value ? "TRUE" : "FALSE";
  }
}

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

function readZip(buffer: Buffer): Map<string, () => Buffer> {
  const minEocd = 22;
  if (buffer.length < minEocd) throw new XlsxError("NOT_ZIP");
  let eocd = -1;
  const searchStart = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - minEocd; i >= searchStart; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("NOT_ZIP");
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const entries = new Map<string, () => Buffer>();
  for (let i = 0; i < total; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new XlsxError("NOT_ZIP");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    entries.set(name, () => {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new XlsxError("NOT_ZIP");
      const localName = buffer.readUInt16LE(localOffset + 26);
      const localExtra = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      throw new XlsxError("UNSUPPORTED_COMPRESSION");
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// XML-hulpjes. Regexen volstaan: dit is machinaal geschreven XML met een vaste
// vorm, geen willekeurige invoer van een mens.
// ---------------------------------------------------------------------------

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, code: string) => {
    switch (code) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return String.fromCodePoint(
          code.startsWith("#x") ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10),
        );
    }
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[match[1]] = decodeXml(match[2]);
  return out;
}

/** Alle `<t>`-stukken binnen een stuk XML aan elkaar, zonder fonetische hulp. */
function runText(xml: string): string {
  const cleaned = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const match of cleaned.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(match[1]);
  return out;
}

// ---------------------------------------------------------------------------
// Stijlen: vulkleur en getalnotatie per stijlindex
// ---------------------------------------------------------------------------

type Style = { fill: string | null; isDate: boolean };

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormat(code: string): boolean {
  // Tekst tussen aanhalingstekens en blokken als [Red] of [$-413] tellen niet.
  const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]+$/.test(bare);
}

/** De twaalf themakleuren in de volgorde die Excel met `theme="n"` aanspreekt. */
function themeColors(xml: string | null): string[] {
  if (!xml) return [];
  const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml)?.[0] ?? "";
  const byName = new Map<string, string>();
  for (const match of scheme.matchAll(/<a:(\w+)>\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/g)) {
    byName.set(match[1], (match[2] ?? match[3]).toUpperCase());
  }
  // Excel wisselt de eerste twee paren om: thema 0 is lt1, thema 1 is dk1.
  return ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"].map(
    (name) => byName.get(name) ?? "",
  );
}

function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const tinted = channels.map((c) => Math.round(tint > 0 ? c + (255 - c) * tint : c * (1 + tint)));
  return tinted.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function colorOf(tag: string | undefined, theme: string[]): string | null {
  if (!tag) return null;
  const a = attrs(tag);
  if (a.rgb && /^[0-9A-Fa-f]{8}$/.test(a.rgb)) {
    // ARGB; een volledig doorzichtige kleur is geen vulling.
    if (a.rgb.slice(0, 2) === "00" && a.rgb.slice(2) === "000000") return null;
    return a.rgb.slice(2).toUpperCase();
  }
  if (a.rgb && /^[0-9A-Fa-f]{6}$/.test(a.rgb)) return a.rgb.toUpperCase();
  if (a.theme !== undefined) {
    const base = theme[Number(a.theme)];
    if (!base) return null;
    return applyTint(base, Number(a.tint ?? 0));
  }
  return null;
}

function readStyles(xml: string | null, theme: string[]): Style[] {
  if (!xml) return [];
  const numFmts = new Map<number, string>();
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const a = attrs(match[1]);
    numFmts.set(Number(a.numFmtId), a.formatCode ?? "");
  }

  const fillsXml = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(xml)?.[1] ?? "";
  const fills: (string | null)[] = [];
  for (const match of fillsXml.matchAll(/<fill\b[^>]*?(?:\/>|>([\s\S]*?)<\/fill>)/g)) {
    const body = match[1] ?? "";
    const pattern = /<patternFill\b([^>]*)/.exec(body);
    const patternType = pattern ? attrs(pattern[1]).patternType : undefined;
    if (!pattern || !patternType || patternType === "none") {
      fills.push(null);
      continue;
    }
    fills.push(colorOf(/<fgColor\b[^>]*\/?>/.exec(body)?.[0], theme));
  }

  const xfsXml = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const styles: Style[] = [];
  for (const match of xfsXml.matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const a = attrs(match[1]);
    const numFmtId = Number(a.numFmtId ?? 0);
    const code = numFmts.get(numFmtId);
    styles.push({
      fill: fills[Number(a.fillId ?? 0)] ?? null,
      isDate: code !== undefined ? isDateFormat(code) : BUILTIN_DATE_FORMATS.has(numFmtId),
    });
  }
  return styles;
}

// ---------------------------------------------------------------------------
// Werkboek
// ---------------------------------------------------------------------------

/** Excel-serienummer (1900-systeem) naar een UTC-datum. */
function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86_400_000));
}

function resolveTarget(target: string): string {
  const clean = target.replace(/^\/+/, "");
  return clean.startsWith("xl/") ? clean : `xl/${clean}`;
}

function readSheet(
  name: string,
  hidden: boolean,
  xml: string,
  sharedStrings: string[],
  styles: Style[],
): Sheet {
  const cells = new Map<number, Cell>();
  let maxRow = 0;
  let maxCol = 0;
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? "";

  for (const match of data.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = attrs(match[1]);
    const ref = a.r ? parseRef(a.r) : null;
    if (!ref) continue;
    const body = match[2] ?? "";
    const style = styles[Number(a.s ?? 0)];
    const fill = style?.fill ?? null;
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];

    let value: CellValue | null = null;
    switch (a.t) {
      case "s": {
        const text = raw !== undefined ? sharedStrings[Number(raw)] : undefined;
        if (text !== undefined && text !== "") value = { kind: "text", text };
        break;
      }
      case "inlineStr": {
        const text = runText(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
        if (text !== "") value = { kind: "text", text };
        break;
      }
      case "str":
        if (raw !== undefined && raw !== "") value = { kind: "text", text: decodeXml(raw) };
        break;
      case "b":
        if (raw !== undefined) value = { kind: "bool", value: raw === "1" };
        break;
      case "e":
        break;
      default:
        if (raw !== undefined && raw !== "") {
          const n = Number(raw);
          if (Number.isFinite(n)) {
            value = style?.isDate ? { kind: "date", value: serialToDate(n) } : { kind: "number", value: n };
          }
        }
    }

    if (!value && !fill) continue;
    cells.set(cellKey(ref.row, ref.col), {
      row: ref.row,
      col: ref.col,
      value: value ?? { kind: "text", text: "" },
      fill,
    });
    if (ref.row > maxRow) maxRow = ref.row;
    if (ref.col > maxCol) maxCol = ref.col;
  }

  const merges: MergeRange[] = [];
  for (const match of xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
    const from = parseRef(match[1]);
    const to = parseRef(match[2]);
    if (from && to) merges.push({ r1: from.row, c1: from.col, r2: to.row, c2: to.col });
  }

  return { name, hidden, cells, merges, maxRow, maxCol };
}

/**
 * Leest een xlsx uit een buffer. Gooit `XlsxError` wanneer het geen geldig
 * werkboek is; de aanroeper maakt daar een gewone invoerfout van.
 */
export function readWorkbook(buffer: Buffer): Workbook {
  const zip = readZip(buffer);
  const read = (path: string): string | null => {
    const entry = zip.get(path);
    return entry ? entry().toString("utf8") : null;
  };

  const workbookXml = read("xl/workbook.xml");
  if (!workbookXml) throw new XlsxError("NOT_XLSX");
  const relsXml = read("xl/_rels/workbook.xml.rels") ?? "";
  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(match[1]);
    if (a.Id && a.Target) targets.set(a.Id, resolveTarget(a.Target));
  }

  const sharedXml = read("xl/sharedStrings.xml") ?? "";
  const sharedStrings: string[] = [];
  for (const match of sharedXml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    sharedStrings.push(runText(match[1] ?? ""));
  }

  const theme = themeColors(read("xl/theme/theme1.xml"));
  const styles = readStyles(read("xl/styles.xml"), theme);

  const sheets: Sheet[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attrs(match[1]);
    const target = targets.get(a["r:id"] ?? "");
    const xml = target ? read(target) : null;
    if (!xml) continue;
    sheets.push(readSheet(a.name ?? "", a.state === "hidden" || a.state === "veryHidden", xml, sharedStrings, styles));
  }
  if (sheets.length === 0) throw new XlsxError("NOT_XLSX");
  return { sheets };
}
