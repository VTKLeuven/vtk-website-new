import {
  cellKey,
  cellText,
  formatRef,
  type Cell,
  type MergeRange,
  type Sheet,
  type Workbook,
} from "@/lib/praesidiumShifts/xlsx";
import {
  cleanLabel,
  looksLikeName,
  nameKey,
  parseTimeRange,
  rangeHours,
  splitNames,
  splitTimePrefix,
  type TimeRange,
} from "@/lib/praesidiumShifts/names";

/*
 * Van een werkboek naar een lijst "wie staat waar". Geen database, geen
 * praesidium: dit leest enkel de spreadsheet. Koppelen aan mensen gebeurt
 * daarna (`names.ts`), tellen nog later (`stats.ts`).
 *
 * Een shiftenlijst heeft geen vaste vorm, maar wel een vaste gewoonte: boven
 * elke kolom met namen staat een uur ("13u00–14u30", "8:00 - 10:00",
 * "21h-23h"). Een vakje telt dus als naam wanneer er een uur boven staat, het
 * op een naam lijkt, en het niet dezelfde kleur heeft als die koppen. Zo vallen
 * de locaties, de rollen links, de opmerkingen rechts en de tellers bovenaan
 * vanzelf weg, zonder dat de lijst een bepaald formaat moet volgen.
 */

export type SheetKind = "SHIFTS" | "CONTACTS" | "SCHEDULE" | "EMPTY";

export type ParsedEntry = {
  sheet: string;
  cell: string;
  rawName: string;
  label: string;
  nameKey: string;
  color: string | null;
  role: string | null;
  slot: string | null;
  date: Date | null;
  hours: number | null;
  note: string | null;
  done: boolean | null;
  /** De lijst zegt zelf dat deze shift niet meetelt ("telt niet mee in de counter"). */
  excluded: boolean;
};

export type ParsedSheet = {
  name: string;
  kind: SheetKind;
  names: number;
  /** Datum van het tabblad als `yyyy-mm-dd`, voor de lijst van tabbladen. */
  date: string | null;
  counted: boolean;
};

export type ParsedColor = { color: string | null; names: number; samples: string[] };

export type ParsedSlot = { sheet: string; color: string; empty: number };

export type ParsedContact = {
  name: string;
  nameKey: string;
  kring: string | null;
  phone: string | null;
  email: string | null;
};

export type Analysis = {
  sheets: ParsedSheet[];
  colors: ParsedColor[];
  slots: ParsedSlot[];
  entries: ParsedEntry[];
  contacts: ParsedContact[];
  eventDate: Date | null;
  /** "Iedereen doet 6 shiften": het getal dat de lijst zelf als richtlijn noemt. */
  suggestedExpected: number | null;
};

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

type MergeIndex = Map<number, MergeRange>;

function mergeIndex(sheet: Sheet): MergeIndex {
  const index: MergeIndex = new Map();
  for (const range of sheet.merges) {
    // Een samengevoegd blok van een hele kolom breed hoeft niet cel per cel.
    if ((range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) > 5000) continue;
    for (let r = range.r1; r <= range.r2; r += 1) {
      for (let c = range.c1; c <= range.c2; c += 1) index.set(cellKey(r, c), range);
    }
  }
  return index;
}

/** De cel die op (row, col) te zien is, ook als die in een samengevoegd blok valt. */
function visibleCell(sheet: Sheet, merges: MergeIndex, row: number, col: number): Cell | undefined {
  const range = merges.get(cellKey(row, col));
  return range ? sheet.cells.get(cellKey(range.r1, range.c1)) : sheet.cells.get(cellKey(row, col));
}

function textOf(cell: Cell | undefined): string {
  return cell && cell.value.kind === "text" ? cell.value.text.trim() : "";
}

function sortedCells(sheet: Sheet): Cell[] {
  return [...sheet.cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Minuten na middernacht naar "13u30", zoals de lijsten het zelf schrijven. */
function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}u${String(m % 60).padStart(2, "0")}`;
}

/** De datum van een tabblad: de eerste datum in de bovenste rijen ("Datum: ..."). */
function sheetDate(sheet: Sheet): Date | null {
  for (const cell of sortedCells(sheet)) {
    if (cell.row > 5) break;
    if (cell.value.kind === "date") return cell.value.value;
  }
  return null;
}

/** Belgische gsm-nummers verliezen hun 0 als ze als getal in de cel staan. */
export function formatPhone(raw: string): string | null {
  const text = raw.trim();
  if (!text || text === "/" || text === "-") return null;
  const digits = text.replace(/\D/g, "");
  const mobile = /^(?:0032|32|0)?(4\d{8})$/.exec(digits);
  if (mobile) {
    const d = `0${mobile[1]}`;
    return `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
  }
  if (digits.length < 8) return null;
  return text;
}

/** "Telt niet mee in de counter", "Deze shiften tellen niet mee". */
const NOT_COUNTED = /\b(telt|tellen)\s+niet\s+mee\b|\bdoes\s+not\s+count\b|\bdon'?t\s+count\b/i;

const GENERIC_HEADER_LABELS = new Set([
  "locatie", "plaats", "taak", "taken", "functie", "shift", "shiften", "rol", "wat", "wie", "title",
  "description", "date", "datum", "uur", "tijd", "filled",
]);

// ---------------------------------------------------------------------------
// Contacten (het overzichtstabblad)
// ---------------------------------------------------------------------------

const PHONE_HEADER = /^(telefoon(nummer)?|tel(\.|efoon)?( ?nr\.?)?|gsm( ?-?nummer| ?nr\.?)?|phone( number)?|number|nummer|mobile)$/i;
const FIRST_HEADER = /^(voornaam|first ?name)$/i;
const LAST_HEADER = /^(achternaam|familienaam|last ?name|surname)$/i;
const FULL_HEADER = /^(voornaam ?\+ ?(achter)?naam|naam ?\+ ?voornaam|naam|full ?name|name|voor- en achternaam)$/i;
const KRING_HEADER = /^(kring|club|vereniging|organisatie)$/i;
const EMAIL_HEADER = /^(e-?mail(adres)?|mail)$/i;

function headerLabel(cell: Cell | undefined): string {
  return textOf(cell).replace(/\s+/g, " ").replace(/:$/, "").trim();
}

/**
 * Leest de contactgegevens uit een overzichtstabblad: een kop "Telefoonnummer"
 * (of "Number", "GSM") met nummers eronder, en een naam ernaast. Studentenwelkom
 * heeft er twee tabellen naast elkaar in, mét een kolom "Kring"; 24UL één, met
 * "Voornaam + Naam". Geeft null terug als er geen telefoonkolom is.
 */
function readContacts(sheet: Sheet): ParsedContact[] | null {
  const merges = mergeIndex(sheet);
  for (let row = 1; row <= Math.min(sheet.maxRow, 20); row += 1) {
    const headers: { col: number; label: string }[] = [];
    for (let col = 1; col <= sheet.maxCol; col += 1) {
      const label = headerLabel(sheet.cells.get(cellKey(row, col)));
      if (label) headers.push({ col, label });
    }
    const phoneCols = headers.filter((h) => PHONE_HEADER.test(h.label)).map((h) => h.col);
    if (phoneCols.length === 0) continue;

    const contacts: ParsedContact[] = [];
    let phoneRows = 0;
    phoneCols.forEach((phoneCol, index) => {
      const from = index === 0 ? 1 : phoneCols[index - 1] + 1;
      const to = index === phoneCols.length - 1 ? sheet.maxCol : phoneCols[index + 1] - 1;
      const inRange = headers.filter((h) => h.col >= from && h.col <= to);
      const left = inRange.filter((h) => h.col < phoneCol);
      const first = left.find((h) => FIRST_HEADER.test(h.label))?.col;
      const last = left.find((h) => LAST_HEADER.test(h.label) || (first !== undefined && /^naam$/i.test(h.label)))?.col;
      const full = first === undefined ? left.find((h) => FULL_HEADER.test(h.label))?.col : undefined;
      const kring = left.find((h) => KRING_HEADER.test(h.label))?.col;
      const email = inRange.find((h) => EMAIL_HEADER.test(h.label))?.col;
      if (first === undefined && full === undefined) return;

      for (let r = row + 1; r <= sheet.maxRow; r += 1) {
        const at = (col: number | undefined) =>
          col === undefined ? "" : cellText(visibleCell(sheet, merges, r, col)).trim();
        const name = full !== undefined ? at(full) : [at(first), at(last)].filter(Boolean).join(" ");
        if (!name || !looksLikeName(name)) continue;
        const phone = formatPhone(at(phoneCol));
        if (phone) phoneRows += 1;
        contacts.push({
          name: cleanLabel(name),
          nameKey: nameKey(name),
          kring: at(kring) || null,
          phone,
          email: at(email) || null,
        });
      }
    });
    if (phoneRows >= 2) return contacts;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shiftenlijst van een evenement
// ---------------------------------------------------------------------------

type Header = { row: number; c1: number; c2: number; range: TimeRange };

function slotLabel(headers: Header[]): string | null {
  if (headers.length === 0) return null;
  if (headers.length === 1) return headers[0].range.label;
  const first = headers[0].range;
  const last = headers[headers.length - 1].range;
  return `${clock(first.start)}-${last.end === null ? "einde" : clock(last.end)}`;
}

function analyzeShiftSheet(sheet: Sheet, date: Date | null) {
  const merges = mergeIndex(sheet);
  const cells = sortedCells(sheet);

  // 1. De koppen: elk vakje met een uur erin, over de kolommen die het beslaat.
  const headers: Header[] = [];
  const headerKeys = new Set<number>();
  for (const cell of cells) {
    const text = textOf(cell);
    if (!text) continue;
    const range = parseTimeRange(text);
    if (!range) continue;
    // "23u-1u: Maxime" is een naam met een eigen uur, geen kop.
    const prefixed = splitTimePrefix(text);
    if (prefixed.range && looksLikeName(prefixed.rest)) continue;
    const merge = merges.get(cellKey(cell.row, cell.col));
    headers.push({ row: cell.row, c1: cell.col, c2: merge ? merge.c2 : cell.col, range });
    headerKeys.add(cellKey(cell.row, cell.col));
  }
  const headerFills = new Set(
    headers.map((h) => sheet.cells.get(cellKey(h.row, h.c1))?.fill).filter((f): f is string => Boolean(f)),
  );

  const headersByCol = new Map<number, Header[]>();
  for (const header of headers) {
    for (let c = header.c1; c <= header.c2; c += 1) {
      const list = headersByCol.get(c) ?? [];
      list.push(header);
      headersByCol.set(c, list);
    }
  }
  const headerAbove = (row: number, col: number): Header | null => {
    let best: Header | null = null;
    for (const header of headersByCol.get(col) ?? []) {
      if (header.row < row && (!best || header.row > best.row)) best = header;
    }
    return best;
  };
  const underHeader = (cell: Cell) => headerAbove(cell.row, cell.col) !== null;

  // Titels over de hele breedte ("STAGE Oude Markt", "Transport"): een rij met
  // een label buiten de urenkolommen en lege vakjes in dezelfde kleur ernaast.
  // Die lege vakjes zijn een banner, geen open shift. Een legende ("Op te vullen
  // Apolloon" in het blauw van Apolloon) telt hier bewust niet als titel: die
  // staat alleen, en haar kleur is net die van de open vakjes.
  const bannerRows = new Set<number>();
  const byRow = new Map<number, Cell[]>();
  for (const cell of cells) {
    const list = byRow.get(cell.row) ?? [];
    list.push(cell);
    byRow.set(cell.row, list);
  }
  for (const [row, rowCells] of byRow) {
    for (const label of rowCells) {
      if (!label.fill || !textOf(label) || underHeader(label)) continue;
      const merge = merges.get(cellKey(label.row, label.col));
      const wide = merge ? merge.c2 - merge.c1 >= 6 : false;
      const sameFillEmpty = rowCells.filter((c) => c !== label && c.fill === label.fill && !textOf(c)).length;
      if (wide || sameFillEmpty >= 3) bannerRows.add(row);
    }
    // Een gekleurde scheidingsband zonder tekst: van kolom A tot achteraan
    // dezelfde kleur, aaneengesloten.
    // Begint ze in kolom A, dan volstaan zes vakjes; begint ze pas onder de
    // uren, dan moet ze echt breed zijn, want een rij lege shiften lijkt erop.
    const texts = rowCells.filter((c) => textOf(c)).length;
    const first = rowCells[0];
    if (texts <= 1 && first?.fill) {
      const band = rowCells.filter((c) => c.fill === first.fill);
      const span = band[band.length - 1].col - first.col + 1;
      const needed = underHeader(first) ? 16 : 6;
      if (band.length >= needed && band.length >= span * 0.8) bannerRows.add(row);
    }
  }

  // "Telt niet mee in de counter" naast een rit of bovenaan het tabblad.
  const excludedRows = new Set<number>();
  for (const cell of cells) {
    if (NOT_COUNTED.test(textOf(cell))) excludedRows.add(cell.row);
  }

  const leftmostTimeCol = new Map<number, number>();
  for (const header of headers) {
    leftmostTimeCol.set(header.row, Math.min(leftmostTimeCol.get(header.row) ?? Infinity, header.c1));
  }

  const labelsLeft = (row: number, untilCol: number): string[] => {
    const out: string[] = [];
    for (let c = 1; c < untilCol; c += 1) {
      const text = textOf(visibleCell(sheet, merges, row, c)).replace(/\s+/g, " ");
      if (text && text.length <= 40 && !out.includes(text)) out.push(text);
    }
    return out;
  };

  // 2. De namen en de lege vakjes eronder.
  const entries: ParsedEntry[] = [];
  const empty = new Map<string, number>();
  for (const cell of cells) {
    const key = cellKey(cell.row, cell.col);
    if (headerKeys.has(key)) continue;
    const merge = merges.get(key);
    if (merge && (merge.r1 !== cell.row || merge.c1 !== cell.col)) continue;
    if (cell.fill && headerFills.has(cell.fill)) continue;
    const c2 = merge ? merge.c2 : cell.col;

    // Het vakje begint zelf onder een uur. Een banner die van kolom A over de
    // hele breedte loopt, valt zo weg, ook al ligt hij deels onder de koppen.
    const startHeader = headerAbove(cell.row, cell.col);
    if (!startHeader) continue;
    const spanHeaders: Header[] = [startHeader];
    for (let c = cell.col + 1; c <= c2; c += 1) {
      const header = headerAbove(cell.row, c);
      if (header && header.row === startHeader.row && !spanHeaders.includes(header)) spanHeaders.push(header);
    }
    spanHeaders.sort((a, b) => a.c1 - b.c1);

    const text = textOf(cell);
    if (!text) {
      if (cell.fill && cell.fill !== "FFFFFF" && !bannerRows.has(cell.row)) {
        empty.set(cell.fill, (empty.get(cell.fill) ?? 0) + 1);
      }
      continue;
    }

    const names = splitNames(text).filter((piece) => looksLikeName(piece));
    if (names.length === 0) continue;

    const headerRow = spanHeaders[0].row;
    const blockLabels = labelsLeft(headerRow, leftmostTimeCol.get(headerRow) ?? cell.col).filter(
      (label) => !GENERIC_HEADER_LABELS.has(label.toLowerCase()),
    );
    const rowLabels = labelsLeft(cell.row, leftmostTimeCol.get(headerRow) ?? cell.col);
    const role = [...blockLabels, ...rowLabels.filter((l) => !blockLabels.includes(l))].slice(0, 2).join(" · ") || null;

    const spanHours = spanHeaders.every((h) => h.range.end !== null)
      ? spanHeaders.reduce((sum, h) => sum + (rangeHours(h.range) ?? 0), 0)
      : null;
    const note = /\(([^)]*)\)/.exec(text)?.[1]?.trim() || null;

    for (const piece of names) {
      const own = splitTimePrefix(piece);
      entries.push({
        sheet: sheet.name,
        cell: formatRef(cell.row, cell.col),
        rawName: piece,
        label: cleanLabel(piece),
        nameKey: nameKey(piece),
        color: cell.fill,
        role,
        slot: own.range?.label ?? slotLabel(spanHeaders),
        date,
        hours: own.range ? rangeHours(own.range) : spanHours,
        note,
        done: null,
        excluded: excludedRows.has(cell.row),
      });
    }
  }

  return {
    entries,
    slots: [...empty].map(([color, count]) => ({ sheet: sheet.name, color, empty: count })),
  };
}

// ---------------------------------------------------------------------------
// Een tabblad als tabel: een rij per shift, kolommen voor wie ("Chauffeur",
// "Bijrijder 1"). Zo ziet het transport van 24UL eruit: geen uren in de kop,
// wel een start- en een einduur per rij.
// ---------------------------------------------------------------------------

const PERSON_HEADER =
  /^(chauffeur|bestuurder|driver|bijrijder(\s*\d)?|co-?driver|shifters?(\s*\d)?|namen|wie|personen|vrijwilligers?(\s*\d)?|helpers?(\s*\d)?)$/i;
const DATE_HEADER = /^(datum|date|dag|day)$/i;
const START_HEADER = /^(start(uur)?|begin(uur)?|van|vanaf|from|aanvang)$/i;
const END_HEADER = /^(eind(uur)?|einde|end|tot|until)$/i;

/** Een tijdstip uit een cel: een tijdwaarde, een fractie van een dag of "15u". */
function timeOfDay(cell: Cell | undefined): number | null {
  if (!cell) return null;
  const v = cell.value;
  if (v.kind === "date") return v.value.getUTCHours() * 60 + v.value.getUTCMinutes();
  if (v.kind === "number" && v.value >= 0 && v.value < 1) return Math.round(v.value * 1440);
  if (v.kind === "text") {
    const match = /^(\d{1,2})\s*[u:h]\s*(\d{2})?/i.exec(v.text.trim());
    if (match && Number(match[1]) <= 24) return Number(match[1]) * 60 + Number(match[2] ?? 0);
  }
  return null;
}

function analyzeTableSheet(sheet: Sheet, date: Date | null): ParsedEntry[] {
  const merges = mergeIndex(sheet);
  for (let row = 1; row <= Math.min(sheet.maxRow, 15); row += 1) {
    const headers: { col: number; label: string }[] = [];
    for (let col = 1; col <= sheet.maxCol; col += 1) {
      const label = headerLabel(sheet.cells.get(cellKey(row, col)));
      if (label) headers.push({ col, label });
    }
    const personCols = headers.filter((h) => PERSON_HEADER.test(h.label)).map((h) => h.col);
    if (personCols.length === 0) continue;
    const dateCol = headers.find((h) => DATE_HEADER.test(h.label))?.col;
    const startCol = headers.find((h) => START_HEADER.test(h.label))?.col;
    const endCol = headers.find((h) => END_HEADER.test(h.label))?.col;
    const roleCol = headers.find(
      (h) => !personCols.includes(h.col) && h.col !== dateCol && h.col !== startCol && h.col !== endCol,
    )?.col;

    const entries: ParsedEntry[] = [];
    for (let r = row + 1; r <= sheet.maxRow; r += 1) {
      const rowTexts: string[] = [];
      for (let c = 1; c <= sheet.maxCol; c += 1) rowTexts.push(textOf(sheet.cells.get(cellKey(r, c))));
      const excluded = rowTexts.some((text) => NOT_COUNTED.test(text));
      const dateCell = dateCol ? visibleCell(sheet, merges, r, dateCol) : undefined;
      const rowDate = dateCell?.value.kind === "date" ? dateCell.value.value : date;
      const start = timeOfDay(startCol ? visibleCell(sheet, merges, r, startCol) : undefined);
      let end = timeOfDay(endCol ? visibleCell(sheet, merges, r, endCol) : undefined);
      if (start !== null && end !== null && end <= start) end += 1440;
      const role = roleCol ? textOf(visibleCell(sheet, merges, r, roleCol)).replace(/\s+/g, " ") || null : null;

      for (const col of personCols) {
        const cell = sheet.cells.get(cellKey(r, col));
        const text = textOf(cell);
        if (!text) continue;
        for (const piece of splitNames(text)) {
          if (!looksLikeName(piece)) continue;
          entries.push({
            sheet: sheet.name,
            cell: formatRef(r, col),
            rawName: piece,
            label: cleanLabel(piece),
            nameKey: nameKey(piece),
            color: cell?.fill ?? null,
            role,
            slot: start !== null ? `${clock(start)}-${end !== null ? clock(end) : "einde"}` : null,
            date: rowDate,
            hours: start !== null && end !== null ? (end - start) / 60 : null,
            note: null,
            done: null,
            excluded,
          });
        }
      }
    }
    if (entries.length > 0) return entries;
  }
  return [];
}

/** Zegt het tabblad bovenaan zelf dat het niet meetelt? ("Deze shiften tellen niet mee") */
function sheetSaysNotCounted(sheet: Sheet): boolean {
  for (const cell of sheet.cells.values()) {
    if (cell.row <= 5 && NOT_COUNTED.test(textOf(cell))) return true;
  }
  return false;
}

const EXPECTED_PATTERN =
  /iedereen\s+(?:doet|neemt|moet|vult|shift)[^.\d]{0,30}?(\d+(?:[.,]\d+)?)\s*(?:shift|praesidiumshift)/i;

function suggestExpected(workbook: Workbook): number | null {
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells.values()) {
      const match = EXPECTED_PATTERN.exec(textOf(cell));
      if (match) return Number(match[1].replace(",", "."));
    }
  }
  return null;
}

function summarizeColors(entries: ParsedEntry[]): ParsedColor[] {
  const byColor = new Map<string | null, ParsedColor>();
  for (const entry of entries) {
    const color = byColor.get(entry.color) ?? { color: entry.color, names: 0, samples: [] };
    color.names += 1;
    if (color.samples.length < 6 && !color.samples.includes(entry.label)) color.samples.push(entry.label);
    byColor.set(entry.color, color);
  }
  return [...byColor.values()].sort((a, b) => b.names - a.names);
}

/** Leest de shiftenlijst van een evenement (24UL, een cantus, Studentenwelkom). */
export function analyzeEventWorkbook(workbook: Workbook): Analysis {
  const sheets: ParsedSheet[] = [];
  const entries: ParsedEntry[] = [];
  const slots: ParsedSlot[] = [];
  const contacts: ParsedContact[] = [];
  let eventDate: Date | null = null;

  for (const sheet of workbook.sheets) {
    const date = sheetDate(sheet);
    if (sheet.hidden || sheet.cells.size === 0) {
      sheets.push({ name: sheet.name, kind: "EMPTY", names: 0, date: null, counted: false });
      continue;
    }
    const found = readContacts(sheet);
    if (found) {
      contacts.push(...found);
      sheets.push({ name: sheet.name, kind: "CONTACTS", names: found.length, date: null, counted: false });
      continue;
    }
    const result = analyzeShiftSheet(sheet, date);
    const sheetEntries = result.entries.length > 0 ? result.entries : analyzeTableSheet(sheet, date);
    entries.push(...sheetEntries);
    slots.push(...result.slots);
    const kind: SheetKind = sheetEntries.length > 0 ? "SHIFTS" : "EMPTY";
    sheets.push({
      name: sheet.name,
      kind,
      names: sheetEntries.length,
      date: date ? isoDay(date) : null,
      counted: kind === "SHIFTS" && !sheetSaysNotCounted(sheet),
    });
    // De datum van het eerste tabblad met shiften. Niet de vroegste: één tikfout
    // in een jaartal (2025 in een lijst van 2026) zette het hele evenement een
    // jaar terug.
    if (kind === "SHIFTS" && date && !eventDate) eventDate = date;
  }

  return {
    sheets,
    colors: summarizeColors(entries),
    slots,
    entries,
    contacts,
    eventDate,
    suggestedExpected: suggestExpected(workbook),
  };
}

// ---------------------------------------------------------------------------
// De wekelijkse praesidiumshiften
// ---------------------------------------------------------------------------

/**
 * Leest het rooster van de wekelijkse praesidiumshiften: een rij per dag (met
 * de datum in een kolom), een kolom per taak (kop bovenaan: "Fak kuisen",
 * "Containerpark 14u30-16u30"), en in elk vakje de namen onder elkaar,
 * eventueel met een eigen uur ervoor ("23u-1u: Maxime"). Een kolom met enkel
 * vinkjes is "Done?"; tekst rechts van de taken is een opmerking bij die dag.
 */
export function analyzeWeeklyWorkbook(workbook: Workbook): Analysis {
  const sheets: ParsedSheet[] = [];
  const entries: ParsedEntry[] = [];
  let eventDate: Date | null = null;

  for (const sheet of workbook.sheets) {
    const cells = sortedCells(sheet);
    const dateCounts = new Map<number, number>();
    for (const cell of cells) {
      if (cell.value.kind === "date") dateCounts.set(cell.col, (dateCounts.get(cell.col) ?? 0) + 1);
    }
    const [dateCol, dateCount] = [...dateCounts].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (sheet.hidden || dateCount < 3) {
      sheets.push({ name: sheet.name, kind: "EMPTY", names: 0, date: null, counted: false });
      continue;
    }

    const dateRows = cells.filter((c) => c.col === dateCol && c.value.kind === "date");
    const firstDateRow = dateRows[0].row;
    let headerRow = 0;
    for (let row = 1; row < firstDateRow && !headerRow; row += 1) {
      let texts = 0;
      for (let col = dateCol + 1; col <= sheet.maxCol; col += 1) {
        if (textOf(sheet.cells.get(cellKey(row, col)))) texts += 1;
      }
      if (texts >= 2) headerRow = row;
    }

    const taskCols: { col: number; label: string; range: TimeRange | null }[] = [];
    let doneCol: number | null = null;
    for (let col = dateCol + 1; col <= sheet.maxCol; col += 1) {
      const below = dateRows.map((d) => sheet.cells.get(cellKey(d.row, col))).filter((c): c is Cell => Boolean(c));
      const bools = below.filter((c) => c.value.kind === "bool").length;
      if (bools > 0 && bools >= below.filter((c) => textOf(c)).length) {
        doneCol = col;
        continue;
      }
      const label = headerRow ? textOf(sheet.cells.get(cellKey(headerRow, col))) : "";
      if (label) taskCols.push({ col, label: label.replace(/\s+/g, " "), range: parseTimeRange(label) });
    }
    const lastTaskCol = Math.max(0, ...taskCols.map((t) => t.col));

    const before = entries.length;
    for (const dateCell of dateRows) {
      if (dateCell.value.kind !== "date") continue;
      const date = dateCell.value.value;
      const row = dateCell.row;
      const noteParts: string[] = [];
      for (let col = lastTaskCol + 1; col <= sheet.maxCol; col += 1) {
        if (col === doneCol) continue;
        const text = textOf(sheet.cells.get(cellKey(row, col)));
        if (text) noteParts.push(text);
      }
      const note = noteParts.join(" · ") || null;
      const doneCell = doneCol ? sheet.cells.get(cellKey(row, doneCol)) : undefined;
      const done = doneCell?.value.kind === "bool" ? doneCell.value.value : null;

      for (const task of taskCols) {
        const cell = sheet.cells.get(cellKey(row, task.col));
        const text = textOf(cell);
        if (!text) continue;
        for (const piece of splitNames(text)) {
          const own = splitTimePrefix(piece);
          if (!looksLikeName(own.rest)) continue;
          entries.push({
            sheet: sheet.name,
            cell: formatRef(row, task.col),
            rawName: piece,
            label: cleanLabel(own.rest),
            nameKey: nameKey(own.rest),
            color: cell?.fill ?? null,
            role: task.label,
            slot: own.range?.label ?? task.range?.label ?? null,
            date,
            hours: own.range ? rangeHours(own.range) : rangeHours(task.range),
            note,
            done,
            excluded: false,
          });
        }
      }
      if (!eventDate || date < eventDate) eventDate = date;
    }

    const names = entries.length - before;
    sheets.push({
      name: sheet.name,
      kind: names > 0 ? "SCHEDULE" : "EMPTY",
      names,
      date: isoDay(dateRows[0].value.kind === "date" ? dateRows[0].value.value : new Date(0)),
      counted: names > 0,
    });
  }

  return { sheets, colors: [], slots: [], entries, contacts: [], eventDate, suggestedExpected: null };
}
