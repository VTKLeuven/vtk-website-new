import { cellKey, cellText, readWorkbook, XlsxError, type Cell, type Sheet } from "@/lib/praesidiumShifts/xlsx";
import { normalizeKey } from "./names";

/*
 * De bedragen uit een budget of resultaat.
 *
 * Elke post vertrekt van hetzelfde sjabloon van de penning: bovenaan een blok
 * "Overzicht" met twee kolommen, Budget en Resultaat, en daaronder de regels
 * Inkomsten, Uitgaven, Totaal, Begroting en de verschillen. Een resultaat is
 * hetzelfde blad met de kolom Resultaat ingevuld. Ernaast staat "Info" met de
 * datum, de locatie en de verantwoordelijke.
 *
 * Wat verschilt van blad tot blad, en waarom hier niets op een vaste cel leunt:
 *
 * - de regels schuiven (Totaal staat op rij 19, 20 of 21, naargelang hoeveel
 *   kostenposten iemand toevoegde), dus we zoeken op het label in de kolom van
 *   "Overzicht";
 * - het blok "Info" staat in kolom M, N of O;
 * - het tabblad heet "BUDGET - overzicht" of "Blad1", en soms staat er een
 *   tabblad met prijzen of locaties vóór; we nemen het eerste waarop het blok
 *   staat.
 *
 * Formules komen binnen als hun laatst berekende waarde. Een Google Sheet wordt
 * daarvoor als xlsx geëxporteerd (`downloadSpreadsheet`).
 */

/** Eén regel uit het blok Overzicht: een inkomsten- of kostenpost. */
export type BoLine = {
  label: string;
  side: "in" | "out";
  budgetCents: number | null;
  /** Enkel ingevuld in een resultaat. */
  resultCents: number | null;
};

export type Figures = {
  sheetPost: string | null;
  sheetTitle: string | null;
  eventDate: Date | null;
  budgetIncomeCents: number | null;
  budgetExpenseCents: number | null;
  budgetTotalCents: number | null;
  resultIncomeCents: number | null;
  resultExpenseCents: number | null;
  resultTotalCents: number | null;
  allocationCents: number | null;
  vtkSharePercent: number | null;
  /** De posten boven Inkomsten en tussen Inkomsten en Uitgaven. */
  lines: BoLine[];
  location: string | null;
};

/** Waarom er geen bedragen zijn. De codes staan vertaald in het beheerscherm. */
export type FiguresError = "UNREADABLE" | "NO_OVERVIEW";

/** Hoe ver onder de kop "Overzicht" de regels nog mogen staan. */
const OVERVIEW_DEPTH = 30;

/** Tekst die het sjabloon laat staan zolang niemand iets invult. */
const PLACEHOLDER = /^(dd\/mm\/yyyy|x+|y+|l+|evenement|naam kost)$/i;

function at(sheet: Sheet, row: number, col: number): Cell | undefined {
  return sheet.cells.get(cellKey(row, col));
}

function label(sheet: Sheet, row: number, col: number): string {
  return normalizeKey(cellText(at(sheet, row, col)));
}

function text(cell: Cell | undefined): string | null {
  const value = cellText(cell).trim();
  return value && !PLACEHOLDER.test(value) ? value : null;
}

/** Wat in een kolom INTEGER past; een bedrag daarboven is een tikfout of een datum. */
const MAX_CENTS = 2_000_000_000;

function cents(cell: Cell | undefined): number | null {
  const value = rawCents(cell);
  return value !== null && Math.abs(value) <= MAX_CENTS ? value : null;
}

/**
 * Een datum enkel als ze in deze eeuw valt. Een cel met "5/3/20026" werd het
 * jaar 20026, en dat weigerde de databank (en hield de hele scan tegen).
 */
function sane(date: Date | null): Date | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? date : null;
}

function rawCents(cell: Cell | undefined): number | null {
  if (!cell) return null;
  const value = cell.value;
  if (value.kind === "number") return Math.round(value.value * 100);
  if (value.kind === "text") {
    // Een bedrag dat als tekst in de cel staat ("1.200,50" of "€ 300").
    const cleaned = value.text.replace(/[€\s]/g, "");
    const normalised = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
    const n = Number(normalised);
    return normalised !== "" && Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  return null;
}

function dateOf(cell: Cell | undefined): Date | null {
  if (!cell) return null;
  const value = cell.value;
  if (value.kind === "date") return value.value;
  // Een datum die als getal binnenkomt omdat de cel geen datumopmaak heeft.
  if (value.kind === "number" && value.value > 40_000 && value.value < 60_000) {
    return new Date(Math.round((value.value - 25569) * 86_400_000));
  }
  if (value.kind === "text") {
    // "6/7/2027-18/7/2027" (een reis): de eerste dag.
    const match = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})(?!\d)/.exec(value.text);
    if (match) {
      const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
      const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

/** De cel met deze tekst als label, in de bovenste rijen van het blad. */
function find(sheet: Sheet, key: string, maxRow = OVERVIEW_DEPTH): Cell | undefined {
  for (const cell of sheet.cells.values()) {
    if (cell.row <= maxRow && normalizeKey(cellText(cell)) === key) return cell;
  }
  return undefined;
}

/** Het blok "Overzicht": de rij met Budget en Resultaat naast elkaar. */
function findOverview(sheet: Sheet): { labelCol: number; budgetCol: number; resultCol: number; row: number } | null {
  for (const cell of sheet.cells.values()) {
    if (cell.row > OVERVIEW_DEPTH || normalizeKey(cellText(cell)) !== "budget") continue;
    const right = label(sheet, cell.row, cell.col + 1);
    if (right !== "resultaat") continue;
    // Het label "Overzicht" staat links op dezelfde rij; zonder is kolom A de gok.
    let labelCol = 1;
    for (let col = cell.col - 1; col >= 1; col -= 1) {
      if (label(sheet, cell.row, col) === "overzicht") {
        labelCol = col;
        break;
      }
    }
    return { labelCol, budgetCol: cell.col, resultCol: cell.col + 1, row: cell.row };
  }
  return null;
}

/**
 * Het aandeel van VTK in het blok "Organisatie / Verdeling": 1 voor een eigen
 * activiteit, 0,5 voor de ECC die we met Industria organiseren.
 */
function vtkShare(sheet: Sheet): number | null {
  const header = find(sheet, "verdeling");
  if (!header) return null;
  for (let row = header.row + 1; row <= header.row + 6; row += 1) {
    for (let col = Math.max(1, header.col - 2); col < header.col; col += 1) {
      if (label(sheet, row, col) !== "vtk") continue;
      const value = at(sheet, row, header.col)?.value;
      if (value?.kind !== "number" || value.value <= 0 || value.value >= 1) return null;
      return Math.round(value.value * 100);
    }
  }
  return null;
}

export function figuresFromSheet(sheet: Sheet): Figures | null {
  const overview = findOverview(sheet);
  if (!overview) return null;

  const lines = new Map<string, number>();
  for (let row = overview.row + 1; row <= overview.row + OVERVIEW_DEPTH; row += 1) {
    const key = label(sheet, row, overview.labelCol);
    // De eerste "Totaal" telt; verder naar onder staan totalen van kostenposten.
    if (key && !lines.has(key)) lines.set(key, row);
  }
  // De posten zelf: alles boven "Inkomsten" is een inkomst, alles tussen
  // "Inkomsten" en "Uitgaven" een kost. Een regel van het sjabloon die nul
  // bleef (de lege "Drinken" onder Inkom) laten we weg.
  const items: BoLine[] = [];
  let side: BoLine["side"] = "in";
  for (let row = overview.row + 1; row <= overview.row + OVERVIEW_DEPTH; row += 1) {
    const raw = cellText(at(sheet, row, overview.labelCol)).trim();
    const key = normalizeKey(raw);
    if (!key) continue;
    if (key === "inkomsten") {
      side = "out";
      continue;
    }
    if (key === "uitgaven" || key === "totaal") break;
    const budgetCents = cents(at(sheet, row, overview.budgetCol));
    const resultCents = cents(at(sheet, row, overview.resultCol));
    if (!budgetCents && !resultCents) continue;
    items.push({ label: raw, side, budgetCents, resultCents });
  }

  const value = (key: string, col: number) => {
    const row = lines.get(key);
    return row === undefined ? null : cents(at(sheet, row, col));
  };

  // De info staat onder haar label, niet ernaast.
  const below = (key: string) => {
    const head = find(sheet, key);
    return head ? at(sheet, head.row + 1, head.col) : undefined;
  };

  return {
    sheetPost: text(at(sheet, 1, 1)),
    sheetTitle: text(at(sheet, 1, 3)),
    eventDate: sane(dateOf(below("datum"))),
    budgetIncomeCents: value("inkomsten", overview.budgetCol),
    budgetExpenseCents: value("uitgaven", overview.budgetCol),
    budgetTotalCents: value("totaal", overview.budgetCol),
    resultIncomeCents: value("inkomsten", overview.resultCol),
    resultExpenseCents: value("uitgaven", overview.resultCol),
    resultTotalCents: value("totaal", overview.resultCol),
    allocationCents: value("begroting", overview.budgetCol),
    vtkSharePercent: vtkShare(sheet),
    lines: items,
    location: text(below("locatie")),
  };
}

/** De bedragen uit een xlsx-bestand, of de reden waarom dat niet lukte. */
export function figuresFromXlsx(buffer: Buffer): { figures: Figures } | { error: FiguresError } {
  let sheets: Sheet[];
  try {
    sheets = readWorkbook(buffer).sheets;
  } catch (err) {
    if (err instanceof XlsxError || err instanceof RangeError) return { error: "UNREADABLE" };
    throw err;
  }
  for (const sheet of sheets) {
    if (sheet.hidden) continue;
    const figures = figuresFromSheet(sheet);
    if (figures) return { figures };
  }
  return { error: "NO_OVERVIEW" };
}
