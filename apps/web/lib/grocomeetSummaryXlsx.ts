import "server-only";

import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";

import { brusselsYMD } from "./brussels";
import { summarySourceLabel, type GrocomeetSummary, type SummaryCounts } from "./grocomeetSummary";
import { formatWorkingYear } from "./workingYear";

/**
 * Het GM-overzicht van /admin/grocomeet als `.xlsx`, voor de herbegroting.
 *
 * Vier bladen: het totaal (wat de herbegroting nodig heeft, dus vooraan), per
 * vergadering (met de totalen per semester en voor het jaar eronder), per
 * product, en een detailblad met één regel per vergadering per product om zelf
 * een draaitabel op te bouwen. Bedragen zijn getallen in euro,
 * datums echte datums, zodat er in Excel mee gerekend en op gefilterd kan worden.
 */

const EURO = "[$€-2]\\ #,##0.00";
const DATE = "dd/mm/yyyy";

function head(labels: string[]): Cell[] {
  return labels.map((label) => ({ value: label, fontWeight: "bold" as const }));
}

function euro(cents: number, bold = false): Cell {
  return { value: cents / 100, type: Number, format: EURO, ...(bold ? { fontWeight: "bold" as const } : {}) };
}

function int(value: number, bold = false): Cell {
  return { value, type: Number, ...(bold ? { fontWeight: "bold" as const } : {}) };
}

/** De datum op de Brusselse klok, als middernacht UTC: anders schuift Excel ze een dag. */
function day(date: Date): Cell {
  const { year, month, day: dayOfMonth } = brusselsYMD(date);
  return { value: new Date(Date.UTC(year, month - 1, dayOfMonth)), type: Date, format: DATE };
}

function countCells(row: SummaryCounts, bold = false): Cell[] {
  return [
    int(row.formItems, bold),
    int(row.formDrinks, bold),
    euro(row.formCents, bold),
    int(row.boxItems, bold),
    euro(row.boxCents, bold),
    euro(row.totalCents, bold),
  ];
}

export async function grocomeetSummaryXlsx(
  summary: GrocomeetSummary,
  workingYear: number,
  nl: boolean,
): Promise<Buffer> {
  const countHead = nl
    ? ["Broodjes (formulier)", "Drankjes (formulier)", "Bedrag formulier", "Stuks GM-doos", "Bedrag GM-doos", "Totaal"]
    : ["Sandwiches (form)", "Drinks (form)", "Form amount", "GM box items", "GM box amount", "Total"];

  const perMeeting: SheetData = [head([nl ? "Datum" : "Date", "Semester", nl ? "Ingeschreven" : "Signed up", ...countHead])];
  for (const row of summary.meetings) {
    perMeeting.push([day(row.startsAt), int(row.semester), int(row.attendees), ...countCells(row)]);
  }
  perMeeting.push([]);
  for (const row of summary.semesters) {
    perMeeting.push([
      { value: nl ? `Semester ${row.semester}` : `Semester ${row.semester}`, fontWeight: "bold" },
      { value: nl ? `${row.meetings} GM's` : `${row.meetings} GMs`, fontWeight: "bold" },
      null,
      ...countCells(row, true),
    ]);
  }
  perMeeting.push([
    { value: nl ? `Totaal ${formatWorkingYear(workingYear)}` : `Total ${formatWorkingYear(workingYear)}`, fontWeight: "bold" },
    { value: nl ? `${summary.year.meetings} GM's` : `${summary.year.meetings} GMs`, fontWeight: "bold" },
    null,
    ...countCells(summary.year, true),
  ]);

  const perProduct: SheetData = [head([nl ? "Bron" : "Source", "Product", nl ? "Aantal" : "Count", nl ? "Bedrag" : "Amount"])];
  for (const row of summary.products) {
    perProduct.push([summarySourceLabel(row.source, nl), row.name, int(row.count), euro(row.cents)]);
  }
  perProduct.push([]);
  perProduct.push([
    { value: nl ? `Totaal ${formatWorkingYear(workingYear)}` : `Total ${formatWorkingYear(workingYear)}`, fontWeight: "bold" },
    null,
    null,
    euro(summary.year.totalCents, true),
  ]);

  const { year } = summary;
  const totals: SheetData = [
    head(["", nl ? "Aantal" : "Count", nl ? "Bedrag" : "Amount"]),
    [nl ? "Broodjes (formulier)" : "Sandwiches (form)", int(year.formItems), null],
    [nl ? "Drankjes (formulier)" : "Drinks (form)", int(year.formDrinks), null],
    [{ value: nl ? "Formulier" : "Form", fontWeight: "bold" }, null, euro(year.formCents, true)],
    [{ value: nl ? "GM-doos (Theokot)" : "GM box (Theokot)", fontWeight: "bold" }, int(year.boxItems), euro(year.boxCents, true)],
    [
      { value: nl ? `Totaal ${formatWorkingYear(workingYear)}` : `Total ${formatWorkingYear(workingYear)}`, fontWeight: "bold" },
      null,
      euro(year.totalCents, true),
    ],
    [],
    [nl ? "Grocomeets geteld" : "Grocomeets counted", int(year.meetings), null],
    [nl ? "Nog te komen, niet geteld" : "Still to come, not counted", int(summary.upcoming), null],
  ];

  const detail: SheetData = [
    head([nl ? "Datum" : "Date", "Semester", nl ? "Bron" : "Source", "Product", nl ? "Aantal" : "Count", nl ? "Bedrag" : "Amount"]),
  ];
  for (const row of summary.details) {
    detail.push([
      day(row.startsAt),
      int(row.semester),
      summarySourceLabel(row.source, nl),
      row.name,
      int(row.count),
      euro(row.cents),
    ]);
  }

  const sheets = [
    { sheet: nl ? "Totaal" : "Total", data: totals, columns: [28, 10, 14] },
    { sheet: nl ? "Per vergadering" : "Per meeting", data: perMeeting, columns: [14, 10, 13, 20, 20, 16, 15, 15, 13] },
    { sheet: nl ? "Per product" : "Per product", data: perProduct, columns: [22, 32, 10, 13] },
    { sheet: "Detail", data: detail, columns: [14, 10, 22, 32, 10, 13] },
  ];

  return writeXlsxFile(
    sheets.map((sheet) => ({
      sheet: sheet.sheet,
      data: sheet.data,
      columns: sheet.columns.map((width) => ({ width })),
      stickyRowsCount: 1,
    })),
  ).toBuffer();
}
