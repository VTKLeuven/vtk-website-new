/**
 * De Excel-bestanden van /admin/inkomsten, als pure bouwer (de server schrijft
 * ze met `write-excel-file`):
 *
 * - **het kwartaalblad voor de boekhouder**, in de schikking en de kleuren van
 *   het tabblad "4e Kwartaal" van het rekenblad van Beheer: een kolom per bron
 *   en per bankrekening, rechts een groen totaalblok per rekening;
 * - **het controlebestand voor Beheer**: hetzelfde blad, maar elke cel is een
 *   `SUMIFS` op het tabblad Transacties, plus een tabblad per bron en de
 *   tussenstappen (per groep, per uitbetaling, wat na te kijken is, wat niet
 *   meetelt, de bestanden).
 *
 * De kleuren komen uit dat tabblad; zie `docs/inkomsten.md`.
 *
 * Een formule staat hier zonder `=` vooraan: `write-excel-file` schrijft de
 * waarde letterlijk in `<f>`, en daar hoort volgens de standaard geen `=`.
 * Met het teken erbij las openpyxl `==SUM(...)`.
 */
import type { Cell, CellObject, SheetData } from "write-excel-file/node";
import { brusselsMinutesOfDay, brusselsYMD } from "@/lib/brussels";
import { codeKey } from "./match";
import type { IncomeKindCode, IncomeSourceCode } from "./parse";

/** De kleuren en de getalnotatie van het kwartaalblad van Beheer. */
export const SHEET_STYLE = {
  headFill: "#0B5394",
  headText: "#F3F3F3",
  rowFill: "#C9DAF8",
  totalHeadFill: "#38761D",
  totalHeadText: "#FFFFFF",
  totalFill: "#B6D7A8",
  euro: "[$€-2]\\ #,##0.00",
} as const;

/** De volgorde van de bronnen in het rekenblad: Europabank, SumUp, Mollie, dan Payconiq. */
const SOURCE_ORDER: readonly IncomeSourceCode[] = ["EUROPABANK", "SUMUP", "MOLLIE", "PAYCONIQ"];
const SOURCE_NAMES: Record<IncomeSourceCode, string> = {
  EUROPABANK: "Europabank",
  SUMUP: "SumUp",
  MOLLIE: "Mollie",
  PAYCONIQ: "Payconiq",
};

export type WorkbookTransaction = {
  occurredAt: Date;
  source: IncomeSourceCode;
  kind: IncomeKindCode;
  channel: string;
  description: string | null;
  amountCents: number;
  /** "2026-09": de maand waarin de regel telt. */
  periodMonth: string | null;
  payoutReference: string | null;
  bankAccount: string | null;
  accountingCode: string | null;
  accountingCodeName: string | null;
  excluded: boolean;
  /** Waarom deze regel deze code kreeg, in woorden. */
  reason: string;
};

export type WorkbookGroup = {
  source: IncomeSourceCode;
  channel: string;
  label: string;
  firstAt: Date;
  lastAt: Date;
  count: number;
  cents: number;
  codes: string;
  reasons: string;
};

export type WorkbookPayout = {
  source: IncomeSourceCode;
  reference: string;
  /** De dag van de overschrijving, als de export ze noemde. */
  paidOn: Date | null;
  firstAt: Date;
  lastAt: Date;
  payments: number;
  refunds: number;
  fees: number;
  reserve: number;
  total: number;
  /** Wat de provider zegt dat hij overschreef (Mollie); null als de export het niet zegt. */
  providerAmount: number | null;
  checked: string;
};

export type WorkbookImport = {
  fileName: string;
  source: IncomeSourceCode;
  createdAt: Date;
  importedBy: string;
  rowsInPeriod: number;
};

export type WorkbookModel = {
  title: string;
  nl: boolean;
  transactions: readonly WorkbookTransaction[];
  /** De plaats van een code in het register (`codeKey` -> index). */
  codeOrder: ReadonlyMap<string, number>;
  /** De naam van een hoofdrekening ("700100" -> "Activiteiten opbrengsten"). */
  mainNames: ReadonlyMap<string, string>;
  feeCode: { code: string; name: string } | null;
  groups: readonly WorkbookGroup[];
  payouts: readonly WorkbookPayout[];
  imports: readonly WorkbookImport[];
};

export type SheetSpec = {
  sheet: string;
  data: SheetData;
  columns: Array<{ width: number }>;
  stickyRowsCount?: number;
};

// -----------------------------------------------------------------------------
// Hulp
// -----------------------------------------------------------------------------

/** "A", ..., "Z", "AA": de letter van een kolom (0 = A). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Een tekst in een formule: aanhalingstekens verdubbeld. */
function quote(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Excel kent geen tijdzones: een datum wordt getoond zoals hij in UTC staat. Dus
 * geven we de Brusselse wandklok door alsof het UTC is, anders stond een betaling
 * van 00:18 op 1 oktober als 22:18 op 30 september in het bestand.
 */
export function wallClock(date: Date): Date {
  const day = brusselsYMD(date);
  const minutes = brusselsMinutesOfDay(date);
  return new Date(Date.UTC(day.year, day.month - 1, day.day, Math.floor(minutes / 60), minutes % 60, date.getUTCSeconds()));
}

function euro(cents: number, style: CellObject = {}): CellObject {
  return { value: cents / 100, type: Number, format: SHEET_STYLE.euro, ...style };
}

// -----------------------------------------------------------------------------
// Het kwartaalblad
// -----------------------------------------------------------------------------

/** De regel van het kwartaalblad waarin een transactie telt, of null als ze niet meetelt. */
export function quarterLineKey(tx: Pick<WorkbookTransaction, "kind" | "accountingCode" | "excluded">): string | null {
  if (tx.excluded) return null;
  if (tx.kind === "FEE") return "Kosten";
  if (tx.kind === "RESERVE") return "Reserve";
  return tx.accountingCode ?? "Na te kijken";
}

/** De naam van een rij in het Transacties-tabblad, ook voor wat niet meetelt. */
function lineLabel(tx: WorkbookTransaction, nl: boolean): string {
  if (tx.excluded) return nl ? "Telt niet mee" : "Does not count";
  return quarterLineKey(tx) ?? "";
}

type QuarterColumn = { source: IncomeSourceCode; account: string };
type QuarterLine = { key: string; post: string; main: string | number; analytic: string };

const NO_ACCOUNT_NL = "Rekening niet ingesteld";
const NO_ACCOUNT_EN = "Account not set";

function accountName(account: string | null, nl: boolean): string {
  return account ?? (nl ? NO_ACCOUNT_NL : NO_ACCOUNT_EN);
}

/** Waar het kwartaalblad begint: drie kolommen tekst, dan de bronnen; drie koprijen, dan de regels. */
const QUARTER_FIRST_SOURCE = 3;
const QUARTER_FIRST_DATA_ROW = 4;

/** De kolommen en regels van het kwartaalblad; de tabbladen per bron zoeken er hun cellen in. */
type QuarterLayout = {
  counted: WorkbookTransaction[];
  columns: QuarterColumn[];
  accounts: string[];
  lines: QuarterLine[];
};

function quarterLayout(model: WorkbookModel): QuarterLayout {
  const { nl } = model;
  const counted = model.transactions.filter((tx) => quarterLineKey(tx) !== null);

  // Kolommen: per bron en per rekening; daarna het totaalblok per rekening.
  const columnKeys = new Map<string, QuarterColumn>();
  for (const tx of counted) {
    const account = accountName(tx.bankAccount, nl);
    columnKeys.set(`${tx.source}|${account}`, { source: tx.source, account });
  }
  const sortAccounts = (a: string, b: string) =>
    (a === accountName(null, nl) ? 1 : 0) - (b === accountName(null, nl) ? 1 : 0) || a.localeCompare(b);
  const columns = [...columnKeys.values()].sort(
    (a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) || sortAccounts(a.account, b.account),
  );
  const accounts = [...new Set(columns.map((column) => column.account))].sort(sortAccounts);

  // Rijen: de codes in de volgorde van het register, dan kosten, reserve en wat nog na te kijken is.
  const codes = [...new Set(counted.flatMap((tx) => (tx.accountingCode && tx.kind !== "FEE" && tx.kind !== "RESERVE" ? [tx.accountingCode] : [])))];
  const rank = (code: string) => model.codeOrder.get(codeKey(code)) ?? Number.MAX_SAFE_INTEGER;
  codes.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const names = new Map(counted.map((tx) => [tx.accountingCode ?? "", tx.accountingCodeName ?? ""]));
  const lines: QuarterLine[] = codes.map((code) => {
    const [main, analytic = ""] = code.split(" ");
    return {
      key: code,
      post: analytic ? (names.get(code) ?? "") : (model.mainNames.get(main) ?? names.get(code) ?? ""),
      main: /^\d+$/.test(main) ? Number(main) : main,
      analytic,
    };
  });
  const hasKind = (kind: IncomeKindCode) => counted.some((tx) => tx.kind === kind);
  if (hasKind("FEE")) {
    const [main, analytic = ""] = (model.feeCode?.code ?? "").split(" ");
    lines.push({
      key: "Kosten",
      post: nl ? "Financiële kosten" : "Financial costs",
      main: /^\d+$/.test(main) ? Number(main) : main,
      analytic,
    });
  }
  if (hasKind("RESERVE")) {
    lines.push({ key: "Reserve", post: nl ? "Wijziging dynamische reserve" : "Change in rolling reserve", main: "x", analytic: "" });
  }
  if (counted.some((tx) => quarterLineKey(tx) === "Na te kijken")) {
    lines.push({ key: "Na te kijken", post: nl ? "Na te kijken (nog geen code)" : "To review (no code yet)", main: "", analytic: "" });
  }
  return { counted, columns, accounts, lines };
}

/**
 * Het kwartaalblad. Met `formulas` telt elke cel met een `SUMIFS` op het tabblad
 * Transacties (voor het controlebestand); zonder staan er de bedragen (voor de
 * boekhouder).
 */
export function quarterSheet(model: WorkbookModel, options: { formulas: boolean }, layout = quarterLayout(model)): SheetSpec {
  const { nl } = model;
  const { counted, columns, accounts, lines } = layout;

  const sums = new Map<string, number>();
  for (const tx of counted) {
    const key = `${quarterLineKey(tx)}|${tx.source}|${accountName(tx.bankAccount, nl)}`;
    sums.set(key, (sums.get(key) ?? 0) + tx.amountCents);
  }

  const head: CellObject = { backgroundColor: SHEET_STYLE.headFill, textColor: SHEET_STYLE.headText };
  const headBold: CellObject = { ...head, fontWeight: "bold" };
  const totalHead: CellObject = { backgroundColor: SHEET_STYLE.totalHeadFill, textColor: SHEET_STYLE.totalHeadText };
  const row: CellObject = { backgroundColor: SHEET_STYLE.rowFill };
  const firstSource = QUARTER_FIRST_SOURCE;
  const lastSource = firstSource + columns.length - 1;
  const firstAccount = lastSource + 1;
  const firstDataRow = QUARTER_FIRST_DATA_ROW;
  const lastDataRow = firstDataRow + lines.length - 1;
  const sourceRange = (r: number) => `$${columnLetter(firstSource)}${r}:$${columnLetter(lastSource)}${r}`;
  /** De rekening per bronkolom staat in rij 3: daar zoekt het totaalblok op. */
  const accountHeaderRange = `$${columnLetter(firstSource)}$3:$${columnLetter(lastSource)}$3`;
  const accountBorders = (index: number, extra: CellObject = {}): CellObject => ({
    ...(index === 0 ? { leftBorderStyle: "thin", leftBorderColor: "#000000" } : {}),
    ...(index === accounts.length - 1 ? { rightBorderStyle: "thin", rightBorderColor: "#000000" } : {}),
    ...extra,
  });

  const data: SheetData = [];

  // Rij 1: de titel over de bronnen, "Totaal" over het totaalblok.
  data.push([
    { value: model.title, ...headBold, columnSpan: 3 + columns.length },
    ...Array<Cell>(2 + columns.length).fill(null),
    ...(accounts.length
      ? [
          {
            value: nl ? "Totaal" : "Total",
            ...totalHead,
            fontWeight: "bold" as const,
            align: "center" as const,
            columnSpan: accounts.length,
            topBorderStyle: "thin" as const,
            leftBorderStyle: "thin" as const,
            rightBorderStyle: "thin" as const,
          },
          ...Array<Cell>(accounts.length - 1).fill(null),
        ]
      : []),
  ]);
  // Rij 2: de bron per kolom; in het totaalblok de rekening, over twee rijen.
  data.push([
    { value: "", ...head },
    { value: "", ...head },
    { value: "", ...head },
    ...columns.map((column) => ({ value: SOURCE_NAMES[column.source], ...head })),
    ...accounts.map((account, index) => accountBorders(index, { value: account, ...totalHead, rowSpan: 2, bottomBorderStyle: "thin" })),
  ]);
  // Rij 3: de koppen van de rijen, en per bronkolom haar rekening.
  data.push([
    { value: nl ? "Post" : "Post", ...head },
    { value: nl ? "Boekhoudcode" : "Accounting code", ...head },
    { value: nl ? "Analytische code" : "Analytic code", ...head },
    ...columns.map((column) => ({ value: column.account, ...head })),
    ...Array<Cell>(accounts.length).fill(null),
  ]);

  lines.forEach((line, lineIndex) => {
    const r = firstDataRow + lineIndex;
    const isLast = lineIndex === lines.length - 1;
    data.push([
      { value: line.post, ...row },
      typeof line.main === "number" ? { value: line.main, type: Number, ...row } : { value: line.main, ...row },
      { value: line.analytic, ...row },
      ...columns.map((column): Cell => {
        if (options.formulas) {
          return {
            type: "Formula",
            value: `SUMIFS(Transacties!$E:$E,Transacties!$I:$I,${quote(line.key)},Transacties!$B:$B,${quote(SOURCE_NAMES[column.source])},Transacties!$H:$H,${quote(column.account)})`,
            format: SHEET_STYLE.euro,
            ...row,
            fontWeight: "bold",
          };
        }
        const cents = sums.get(`${line.key}|${column.source}|${column.account}`);
        return cents === undefined ? { value: "", ...row } : euro(cents, { ...row, fontWeight: "bold" });
      }),
      ...accounts.map((account, index): Cell => {
        const style = accountBorders(index, {
          backgroundColor: SHEET_STYLE.totalFill,
          ...(isLast ? { bottomBorderStyle: "thin" as const, bottomBorderColor: "#000000" } : {}),
        });
        if (options.formulas) {
          return {
            type: "Formula",
            value: `SUMIF(${accountHeaderRange},${quote(account)},${sourceRange(r)})`,
            format: SHEET_STYLE.euro,
            ...style,
          };
        }
        const cents = columns
          .filter((column) => column.account === account)
          .reduce((sum, column) => sum + (sums.get(`${line.key}|${column.source}|${column.account}`) ?? 0), 0);
        return euro(cents, style);
      }),
    ]);
  });

  // TOTAAL GEHEEL
  const columnTotal = (index: number, values: () => number): CellObject =>
    options.formulas && lines.length > 0
      ? {
          type: "Formula",
          value: `SUM(${columnLetter(index)}${firstDataRow}:${columnLetter(index)}${lastDataRow})`,
          format: SHEET_STYLE.euro,
        }
      : euro(values());
  data.push([
    { value: "", ...head },
    { value: nl ? "TOTAAL GEHEEL" : "GRAND TOTAL", ...headBold },
    { value: "", ...head },
    ...columns.map((column, index) => ({
      ...columnTotal(firstSource + index, () =>
        counted
          .filter((tx) => tx.source === column.source && accountName(tx.bankAccount, nl) === column.account)
          .reduce((sum, tx) => sum + tx.amountCents, 0),
      ),
      ...headBold,
    })),
    ...accounts.map((account, index) => ({
      ...columnTotal(firstAccount + index, () =>
        counted.filter((tx) => accountName(tx.bankAccount, nl) === account).reduce((sum, tx) => sum + tx.amountCents, 0),
      ),
      ...accountBorders(index, {
        backgroundColor: SHEET_STYLE.totalHeadFill,
        textColor: SHEET_STYLE.headText,
        fontWeight: "bold",
        bottomBorderStyle: "thin",
      }),
    })),
  ]);

  return {
    sheet: nl ? "Kwartaalblad" : "Quarter sheet",
    data,
    columns: [{ width: 28 }, { width: 19 }, { width: 17 }, ...columns.map(() => ({ width: 18 })), ...accounts.map(() => ({ width: 25 }))],
  };
}

// -----------------------------------------------------------------------------
// De tussenstappen
// -----------------------------------------------------------------------------

function headerRow(labels: string[]): Cell[] {
  return labels.map((label) => ({
    value: label,
    fontWeight: "bold",
    backgroundColor: SHEET_STYLE.headFill,
    textColor: SHEET_STYLE.headText,
  }));
}

const DATE_TIME = "dd/mm/yyyy hh:mm";
const DATE = "dd/mm/yyyy";

function kindLabel(kind: IncomeKindCode, nl: boolean): string {
  const labels: Record<IncomeKindCode, [string, string]> = {
    PAYMENT: ["Betaling", "Payment"],
    REFUND: ["Terugbetaling", "Refund"],
    FEE: ["Kosten", "Fees"],
    RESERVE: ["Reserve", "Reserve"],
  };
  return labels[kind][nl ? 0 : 1];
}

/**
 * Elke transactie van de periode, met de regel van het kwartaalblad waarin ze
 * telt (kolom I): daar rekenen de formules van het kwartaalblad op. De kolommen
 * liggen dus vast; schuif er niets tussen zonder `quarterSheet` mee te passen.
 */
export function transactionsSheet(model: WorkbookModel): SheetSpec {
  const { nl } = model;
  const data: SheetData = [
    headerRow(
      nl
        ? ["Datum", "Bron", "Kanaal", "Omschrijving", "Bedrag", "Maand", "Uitbetaling", "Rekening", "Regel in kwartaalblad", "Boekhoudcode", "Naam code", "Soort", "Telt mee", "Waarom"]
        : ["Date", "Source", "Channel", "Description", "Amount", "Month", "Payout", "Account", "Quarter sheet line", "Accounting code", "Code name", "Kind", "Counts", "Why"],
    ),
  ];
  const sorted = [...model.transactions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (const tx of sorted) {
    const counts = quarterLineKey(tx) !== null;
    data.push([
      { value: wallClock(tx.occurredAt), type: Date, format: DATE_TIME },
      SOURCE_NAMES[tx.source],
      tx.channel,
      tx.description ?? "",
      euro(tx.amountCents),
      tx.periodMonth ?? "",
      tx.payoutReference ?? "",
      accountName(tx.bankAccount, nl),
      lineLabel(tx, nl),
      tx.accountingCode ?? "",
      tx.accountingCodeName ?? "",
      kindLabel(tx.kind, nl),
      counts ? (nl ? "ja" : "yes") : nl ? "nee" : "no",
      tx.reason,
    ]);
  }
  return {
    // Vaste naam in beide talen: de formules van het kwartaalblad verwijzen ernaar.
    sheet: "Transacties",
    data,
    columns: [18, 10, 20, 40, 12, 9, 18, 24, 20, 16, 24, 13, 9, 50].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

/** Waar het tabblad van een bron zijn totaal in het kwartaalblad vindt. */
export type QuarterTotalCells = {
  /** De naam van het tabblad kwartaalblad. */
  sheet: string;
  /** De rij TOTAAL GEHEEL, 1-gebaseerd. */
  totalRow: number;
  /** De kolommen van deze bron (een per rekening), als letters; leeg als niets ervan meetelt. */
  columns: string[];
};

/** Een tabbladnaam in een formule: altijd tussen enkele aanhalingstekens. */
function sheetRef(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/**
 * Eén bron, zoals een tabblad van het rekenblad: haar regels met dezelfde
 * kolommen als Transacties (zonder Bron), en rechtsboven een controleblok met
 * formules op die regels: per soort, wat meetelt, wat niet, wat het
 * kwartaalblad voor deze bron telt, en het verschil. Dat verschil hoort nul te
 * zijn: is het dat niet, dan tellen het kwartaalblad en dit tabblad iets
 * anders.
 */
export function sourceSheet(model: WorkbookModel, source: IncomeSourceCode, quarter: QuarterTotalCells): SheetSpec {
  const { nl } = model;
  const yes = nl ? "ja" : "yes";
  const no = nl ? "nee" : "no";
  const rows = model.transactions
    .filter((tx) => tx.source === source)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const last = 1 + rows.length;
  const range = (column: string) => `$${column}$2:$${column}$${last}`;
  // Bedrag (D), Soort (K) en Telt mee (L): de kolommen hieronder, zonder Bron.
  const amounts = range("D");
  const kinds = range("K");
  const counts = range("L");

  const formula = (value: string, style: CellObject = {}): CellObject => ({ type: "Formula", value, format: SHEET_STYLE.euro, ...style });
  const summary: Array<[string, CellObject]> = [];
  const kindTotals: Record<IncomeKindCode, [string, string]> = {
    PAYMENT: ["Betalingen", "Payments"],
    REFUND: ["Terugbetalingen", "Refunds"],
    FEE: ["Kosten", "Fees"],
    RESERVE: ["Reserve", "Reserve"],
  };
  for (const kind of ["PAYMENT", "REFUND", "FEE", "RESERVE"] as const) {
    if (!rows.some((tx) => tx.kind === kind && quarterLineKey(tx) !== null)) continue;
    summary.push([
      kindTotals[kind][nl ? 0 : 1],
      formula(`SUMIFS(${amounts},${kinds},${quote(kindLabel(kind, nl))},${counts},${quote(yes)})`),
    ]);
  }
  const countedRow = 2 + summary.length;
  summary.push([nl ? "Telt mee" : "Counts", formula(`SUMIFS(${amounts},${counts},${quote(yes)})`, { fontWeight: "bold" })]);
  if (rows.some((tx) => quarterLineKey(tx) === null)) {
    summary.push([nl ? "Telt niet mee" : "Does not count", formula(`SUMIFS(${amounts},${counts},${quote(no)})`)]);
  }
  const quarterRow = 2 + summary.length;
  summary.push([
    nl ? "In het kwartaalblad" : "In the quarter sheet",
    quarter.columns.length > 0
      ? formula(`SUM(${quarter.columns.map((column) => `${sheetRef(quarter.sheet)}!${column}${quarter.totalRow}`).join(",")})`)
      : euro(0),
  ]);
  // Afgerond op de cent: twee sommen van dezelfde bedragen in een andere volgorde
  // verschillen anders in de vijftiende decimaal, en dat toont Excel als -0,00.
  summary.push([
    nl ? "Verschil (hoort 0 te zijn)" : "Difference (should be 0)",
    formula(`ROUND(P${countedRow}-P${quarterRow},2)`, { fontWeight: "bold" }),
  ]);

  const data: SheetData = [
    [
      ...headerRow(
        nl
          ? ["Datum", "Kanaal", "Omschrijving", "Bedrag", "Maand", "Uitbetaling", "Rekening", "Regel in kwartaalblad", "Boekhoudcode", "Naam code", "Soort", "Telt mee", "Waarom"]
          : ["Date", "Channel", "Description", "Amount", "Month", "Payout", "Account", "Quarter sheet line", "Accounting code", "Code name", "Kind", "Counts", "Why"],
      ),
      null,
      ...headerRow([nl ? `Controle ${SOURCE_NAMES[source]}` : `Check ${SOURCE_NAMES[source]}`, ""]),
    ],
  ];
  const height = Math.max(rows.length, summary.length);
  for (let index = 0; index < height; index++) {
    const tx = rows[index];
    const line = summary[index];
    data.push([
      ...(tx
        ? [
            { value: wallClock(tx.occurredAt), type: Date, format: DATE_TIME },
            tx.channel,
            tx.description ?? "",
            euro(tx.amountCents),
            tx.periodMonth ?? "",
            tx.payoutReference ?? "",
            accountName(tx.bankAccount, nl),
            lineLabel(tx, nl),
            tx.accountingCode ?? "",
            tx.accountingCodeName ?? "",
            kindLabel(tx.kind, nl),
            quarterLineKey(tx) !== null ? yes : no,
            tx.reason,
          ]
        : Array<Cell>(13).fill(null)),
      null,
      ...(line ? [{ value: line[0], fontWeight: line[1].fontWeight }, line[1]] : [null, null]),
    ] as Cell[]);
  }
  return {
    sheet: SOURCE_NAMES[source],
    data,
    columns: [18, 20, 40, 12, 9, 18, 24, 20, 16, 24, 13, 9, 50, 3, 26, 14].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

export function groupsSheet(model: WorkbookModel): SheetSpec {
  const { nl } = model;
  const data: SheetData = [
    headerRow(
      nl
        ? ["Bron", "Kanaal", "Dag of tekst", "Eerste", "Laatste", "Aantal", "Bedrag", "Boekhoudcode", "Waarom"]
        : ["Source", "Channel", "Day or text", "First", "Last", "Count", "Amount", "Accounting code", "Why"],
    ),
  ];
  for (const group of model.groups) {
    data.push([
      SOURCE_NAMES[group.source],
      group.channel,
      group.label,
      { value: wallClock(group.firstAt), type: Date, format: DATE_TIME },
      { value: wallClock(group.lastAt), type: Date, format: DATE_TIME },
      { value: group.count, type: Number },
      euro(group.cents),
      group.codes,
      group.reasons,
    ]);
  }
  return {
    sheet: nl ? "Per groep" : "Per group",
    data,
    columns: [10, 20, 34, 18, 18, 8, 12, 24, 50].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

export function payoutsSheet(model: WorkbookModel): SheetSpec {
  const { nl } = model;
  const data: SheetData = [
    headerRow(
      nl
        ? ["Bron", "Uitbetaling", "Overgeschreven op", "Eerste regel", "Laatste regel", "Betalingen", "Terugbetalingen", "Kosten", "Reserve", "Totaal", "Volgens de provider", "Afgevinkt"]
        : ["Source", "Payout", "Transferred on", "First row", "Last row", "Payments", "Refunds", "Fees", "Reserve", "Total", "According to the provider", "Checked"],
    ),
  ];
  for (const payout of model.payouts) {
    data.push([
      SOURCE_NAMES[payout.source],
      payout.reference,
      payout.paidOn ? { value: payout.paidOn, type: Date, format: DATE } : "",
      { value: wallClock(payout.firstAt), type: Date, format: DATE },
      { value: wallClock(payout.lastAt), type: Date, format: DATE },
      euro(payout.payments),
      euro(payout.refunds),
      euro(payout.fees),
      euro(payout.reserve),
      euro(payout.total, { fontWeight: "bold" }),
      payout.providerAmount === null ? "" : euro(payout.providerAmount),
      payout.checked,
    ]);
  }
  return {
    sheet: nl ? "Per uitbetaling" : "Per payout",
    data,
    columns: [12, 20, 16, 14, 14, 13, 15, 12, 12, 13, 18, 36].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

/** Wat nog na te kijken is, of wat niet meetelt, als een kortere lijst. */
export function filteredSheet(model: WorkbookModel, which: "open" | "excluded"): SheetSpec {
  const { nl } = model;
  const rows = model.transactions.filter((tx) =>
    which === "open" ? quarterLineKey(tx) === "Na te kijken" : quarterLineKey(tx) === null,
  );
  const data: SheetData = [
    headerRow(nl ? ["Datum", "Bron", "Kanaal", "Omschrijving", "Bedrag", "Waarom"] : ["Date", "Source", "Channel", "Description", "Amount", "Why"]),
  ];
  for (const tx of [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    data.push([
      { value: wallClock(tx.occurredAt), type: Date, format: DATE_TIME },
      SOURCE_NAMES[tx.source],
      tx.channel,
      tx.description ?? "",
      euro(tx.amountCents),
      tx.reason,
    ]);
  }
  return {
    sheet: which === "open" ? (nl ? "Na te kijken" : "To review") : nl ? "Telt niet mee" : "Does not count",
    data,
    columns: [18, 10, 20, 40, 12, 50].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

export function importsSheet(model: WorkbookModel): SheetSpec {
  const { nl } = model;
  const data: SheetData = [
    headerRow(nl ? ["Bestand", "Bron", "Geüpload op", "Door", "Regels in deze periode"] : ["File", "Source", "Uploaded on", "By", "Rows in this period"]),
  ];
  for (const file of model.imports) {
    data.push([
      file.fileName,
      SOURCE_NAMES[file.source],
      { value: wallClock(file.createdAt), type: Date, format: DATE_TIME },
      file.importedBy,
      { value: file.rowsInPeriod, type: Number },
    ]);
  }
  return {
    sheet: nl ? "Bestanden" : "Files",
    data,
    columns: [40, 10, 18, 24, 20].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

/** Het blad voor de boekhouder: enkel het kwartaalblad, met de bedragen. */
export function accountantWorkbook(model: WorkbookModel): SheetSpec[] {
  return [quarterSheet(model, { formulas: false })];
}

/** Het controlebestand voor Beheer: het kwartaalblad met formules, en elke tussenstap. */
export function controlWorkbook(model: WorkbookModel): SheetSpec[] {
  const layout = quarterLayout(model);
  const quarter = quarterSheet(model, { formulas: true }, layout);
  // Een tabblad per bron met regels in de periode, in de volgorde van het kwartaalblad.
  const sources = SOURCE_ORDER.filter((source) => model.transactions.some((tx) => tx.source === source));
  return [
    quarter,
    transactionsSheet(model),
    ...sources.map((source) =>
      sourceSheet(model, source, {
        sheet: quarter.sheet,
        totalRow: QUARTER_FIRST_DATA_ROW + layout.lines.length,
        columns: layout.columns.flatMap((column, index) => (column.source === source ? [columnLetter(QUARTER_FIRST_SOURCE + index)] : [])),
      }),
    ),
    groupsSheet(model),
    payoutsSheet(model),
    filteredSheet(model, "open"),
    filteredSheet(model, "excluded"),
    importsSheet(model),
  ];
}
