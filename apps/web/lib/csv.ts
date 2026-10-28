/**
 * CSV lezen zoals de exports en rekenbladen het schrijven: met `,` of `;`, en
 * aanhalingstekens zoals RFC 4180. Gedeeld door het opladen van online
 * inkomsten (`lib/inkomsten`) en van boekhoudcodes (`lib/accounting`).
 */

/** Het scheidingsteken: Payconiq gebruikt `;`, Mollie en Google Sheets `,`. */
export function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (char: string) => firstLine.split(char).length - 1;
  return count(";") > count(",") ? ";" : ",";
}

/** Rijen en velden, met aanhalingstekens zoals RFC 4180. Lege rijen vallen weg. */
export function parseCsv(text: string, delimiter: "," | ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

