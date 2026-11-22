/**
 * CSV lezen zoals de exports en rekenbladen het schrijven: met `,` of `;`, en
 * aanhalingstekens zoals RFC 4180. Gedeeld door het opladen van online
 * inkomsten (`lib/inkomsten`) en van boekhoudcodes (`lib/accounting`).
 */

/**
 * Het scheidingsteken: Payconiq en KBC gebruiken `;`, Mollie en Google Sheets
 * `,`. De eerste regel eindigt op `\r\n`, `\n` of, bij een bankafschrift van
 * KBC, op een losse `\r`: wie enkel op `\n` splitst, telt over het hele bestand.
 */
export function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/, 1)[0] ?? "";
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


/**
 * Een opgeladen bestand als tekst: UTF-8, en anders Windows-1252 (een export
 * uit een Belgische bank of een oud rekenblad). Een ongeldige UTF-8-reeks valt
 * zo niet stil weg als vervangteken.
 */
export function decodeUpload(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
