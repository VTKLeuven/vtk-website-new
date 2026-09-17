import "server-only";

import writeXlsxFile from "write-excel-file/node";
import { formatWorkingYear } from "@/lib/workingYear";
import type { MemberRow } from ".";

/**
 * De ledenlijst als `.xlsx`.
 *
 * Bewust een echt Excel-bestand en geen CSV, in tegenstelling tot de andere
 * exports op de site: die zijn er om ergens ingelezen te worden (Brevo, een
 * mailinglijst), deze is er om in Excel te openen en na te kijken. Een CSV met
 * datums en bedragen erin geeft in een Belgische Excel meteen gedoe met
 * scheidingstekens en met een r-nummer dat als getal geïnterpreteerd wordt.
 *
 * Eén datum-, tekst- en getalkolom per gegeven; niets samengeplakt, zodat er in
 * Excel op gesorteerd en gefilterd kan worden.
 */

const KIND_LABEL: Record<string, { nl: string; en: string }> = {
  FACULTY: { nl: "Gratis (faculteit)", en: "Free (faculty)" },
  EXTERNAL: { nl: "Betalend", en: "Paying" },
  MANUAL: { nl: "Toegekend", en: "Granted" },
};

export function membershipKindLabel(kind: string, nl: boolean): string {
  const entry = KIND_LABEL[kind];
  return entry ? (nl ? entry.nl : entry.en) : kind;
}

export async function membersXlsx(
  rows: readonly MemberRow[],
  year: number,
  nl: boolean,
): Promise<Buffer> {
  const columns = [
    { key: "name", label: nl ? "Naam" : "Name", width: 28 },
    { key: "email", label: nl ? "E-mail" : "Email", width: 34 },
    { key: "rNumber", label: nl ? "R-nummer" : "R-number", width: 12 },
    { key: "kind", label: nl ? "Soort" : "Kind", width: 18 },
    { key: "price", label: nl ? "Bedrag (EUR)" : "Amount (EUR)", width: 14 },
    { key: "status", label: nl ? "Status" : "Status", width: 14 },
    { key: "activatedAt", label: nl ? "Lid sinds" : "Member since", width: 16 },
    { key: "grantedBy", label: nl ? "Toegekend door" : "Granted by", width: 24 },
    { key: "note", label: nl ? "Notitie" : "Note", width: 30 },
  ] as const;

  const header = columns.map((column) => ({
    value: column.label,
    fontWeight: "bold" as const,
  }));

  const body = rows.map((row) => [
    { type: String, value: row.name },
    { type: String, value: row.email },
    // Als tekst: een r-nummer is geen getal, en Excel maakt er anders r0123456
    // zonder nul van.
    { type: String, value: row.rNumber ?? "" },
    { type: String, value: membershipKindLabel(row.kind, nl) },
    { type: Number, value: row.priceCents / 100, format: "0.00" },
    {
      type: String,
      value: row.activatedAt ? (nl ? "Lid" : "Member") : nl ? "Wacht op betaling" : "Awaiting payment",
    },
    row.activatedAt
      ? { type: Date, value: row.activatedAt, format: "dd/mm/yyyy" }
      : { type: String, value: "" },
    { type: String, value: row.grantedByName ?? "" },
    { type: String, value: row.note ?? "" },
  ]);

  return writeXlsxFile([header, ...body], {
    columns: columns.map((column) => ({ width: column.width })),
    sheet: `${nl ? "Leden" : "Members"} ${formatWorkingYear(year)}`,
    // Bevriest de kopregel, zodat je bij duizend leden nog weet welke kolom je leest.
    stickyRowsCount: 1,
  }).toBuffer();
}
