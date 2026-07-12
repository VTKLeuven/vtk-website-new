export type CsvValue = string | number | boolean | Date | null | undefined;

function serializedValue(value: CsvValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function csvCell(value: CsvValue): string {
  let cell = serializedValue(value);

  // Spreadsheet applications may execute cells beginning with these characters.
  if (/^[\t\r ]*[=+\-@]/.test(cell) || /^[\t\r]/.test(cell)) {
    cell = `'${cell}`;
  }

  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

export function createCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
