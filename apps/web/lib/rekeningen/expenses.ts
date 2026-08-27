/**
 * Zuivere rekeningen-logica: formatteren, parsen en de statusindeling. Geen
 * prisma, geen fs, geen mail; dit bestand mag in een clientbundel belanden.
 *
 * De server-only kant staat in `report.ts` (het blad voor de boekhouder) en
 * `server.ts` (configuratie, toegang, opslag).
 */

/** Bestandstypes die als bonnetje aanvaard worden. Zelfde set als billsheet. */
export const RECEIPT_EXTENSIONS = ["jpg", "jpeg", "png", "pdf"] as const;

/** Wat de bestandskiezer mag tonen. */
export const RECEIPT_ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

/** Plafond per bonnetje. Een foto van een kassaticket haalt dit nooit. */
export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;

/** Prefix in object storage. De leesroute weigert een key van elders. */
export const RECEIPT_PREFIX = "bonnetjes/";

export function isAllowedReceiptName(name: string): boolean {
  const ext = name.toLowerCase().split(".").at(-1) ?? "";
  return (RECEIPT_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Waar een rekening in de workflow staat. Afgeleid, niet opgeslagen: de drie
 * datums (`paidAt`, `sentAt`, `bookedAt`) zijn de waarheid, en een vierde kolom
 * met een statuswoord erin zou daar alleen maar van kunnen afwijken.
 */
export type ExpenseStatus = "TO_REIMBURSE" | "TO_SEND" | "TO_BOOK" | "DONE";

export type ExpenseStatusInput = {
  paidAt: Date | string | null;
  sentAt: Date | string | null;
  bookedAt: Date | string | null;
};

export function expenseStatus(expense: ExpenseStatusInput): ExpenseStatus {
  if (expense.bookedAt) return "DONE";
  if (!expense.paidAt) return "TO_REIMBURSE";
  if (!expense.sentAt) return "TO_SEND";
  return "TO_BOOK";
}

export function expenseStatusLabel(status: ExpenseStatus, nl: boolean): string {
  if (nl) {
    return {
      TO_REIMBURSE: "Terug te betalen",
      TO_SEND: "Door te sturen",
      TO_BOOK: "In te boeken",
      DONE: "Afgehandeld",
    }[status];
  }
  return {
    TO_REIMBURSE: "To reimburse",
    TO_SEND: "To forward",
    TO_BOOK: "To book",
    DONE: "Done",
  }[status];
}

/** De volgorde waarin de statustabs staan: de workflow van links naar rechts. */
export const EXPENSE_STATUSES: ExpenseStatus[] = ["TO_REIMBURSE", "TO_SEND", "TO_BOOK", "DONE"];

// -----------------------------------------------------------------------------
// Geld
// -----------------------------------------------------------------------------

/** Centen naar "1.234,56" (zonder euroteken, want dat staat vaak apart). */
export function formatAmount(cents: number, locale: "nl" | "en" = "nl"): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Centen naar "€ 1.234,56". */
export function formatEuro(cents: number, locale: "nl" | "en" = "nl"): string {
  return `€ ${formatAmount(cents, locale)}`;
}

/**
 * Een ingetikt bedrag naar centen. Aanvaardt zowel "10.23" als "10,23" en een
 * duizendtalpunt ("1.234,56"), want een formulier krijgt alle drie.
 *
 * Geeft `null` bij iets wat geen bedrag is, zodat de action een nette invoerfout
 * kan teruggeven in plaats van stilzwijgend 0 op te slaan (`Number("")` is 0, en
 * dat is precies de val).
 */
export function parseAmountToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/^€\s*/, "");
  if (!trimmed) return null;

  const hasComma = trimmed.includes(",");
  // "1.234,56" -> punten zijn duizendtallen. "1234.56" -> punt is de komma.
  const normalised = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;

  const cents = Math.round(Number(normalised) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000) return null;
  return cents;
}

// -----------------------------------------------------------------------------
// IBAN
// -----------------------------------------------------------------------------

/** Spaties en streepjes eruit, hoofdletters erin. */
export function normaliseIban(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** "BE68539007547034" -> "BE68 5390 0754 7034". */
export function formatIban(raw: string | null | undefined): string {
  if (!raw) return "";
  return normaliseIban(raw).replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Structuur- en mod-97-controle. Vangt de tikfout die een terugbetaling naar het
 * verkeerde rekeningnummer stuurt; een geldig IBAN dat niet van jou is kan dit
 * uiteraard niet zien.
 */
export function isValidIban(raw: string): boolean {
  const iban = normaliseIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  // Stapsgewijs modulo, want het getal past niet in een Number.
  let remainder = 0;
  for (const char of rearranged) {
    const value = char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

// -----------------------------------------------------------------------------
// Datums
// -----------------------------------------------------------------------------

/**
 * Het werkingsjaar waarin een uitgavedatum valt, met dezelfde 15-juli-grens als
 * de rest van de site (zie `@vtk/auth`). Bewust een eigen functie op een
 * meegegeven datum: `currentWorkingYear()` kijkt naar vandaag, en een rekening
 * van juni die je in september indient hoort in het vorige jaar.
 */
export function workingYearOf(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const afterCutover = month > 7 || (month === 7 && day >= 15);
  return afterCutover ? year : year - 1;
}

/** "2026-2027" of "26-27", zoals het op het blad van de boekhouder staat. */
export function academicYearTag(date: Date, format: "short" | "long" = "short"): string {
  const start = workingYearOf(date);
  const end = start + 1;
  if (format === "long") return `${start}-${end}`;
  return `${String(start % 100).padStart(2, "0")}-${String(end % 100).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" uit een Date, in UTC (uitgavedatums zijn kale datums). */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" naar een UTC-middernacht, of null bij een onbestaande datum. */
export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** "18/09/2026" voor de tabel. */
export function formatSpentOn(date: Date, locale: "nl" | "en" = "nl"): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** "19 sep 2026 om 21:04" voor de inspector. */
export function formatMoment(date: Date, locale: "nl" | "en" = "nl"): string {
  const formatted = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return formatted;
}

// -----------------------------------------------------------------------------
// Bestandsnaam van het blad
// -----------------------------------------------------------------------------

/**
 * Vervangt tekens die de boekhouder in een bestandsnaam niet verwacht. Zelfde
 * afbeelding als in billsheet, zodat de namen in zijn map ononderbroken
 * doorlopen over de overstap heen.
 */
function replaceBadCharacters(value: string): string {
  const map: Record<string, string> = {
    ä: "a",
    ö: "o",
    ü: "u",
    ß: "ss",
    Ä: "A",
    Ö: "O",
    Ü: "U",
  };
  return value.replace(/[^\w\s.-]/g, (char) => map[char] ?? "");
}

/** "26-27_Fakbar_Doopcantus_Bierbestelling_248.9.pdf" */
export function expenseReportFilename(expense: {
  spentOn: Date;
  postLabel: string;
  activity: string;
  description: string;
  amountCents: number;
}): string {
  return replaceBadCharacters(
    `${academicYearTag(expense.spentOn)}_${expense.postLabel}_${expense.activity}_${expense.description}_${
      expense.amountCents / 100
    }.pdf`,
  );
}

/** Bytes naar "1,8 MB" / "312 MB". */
export function formatBytes(bytes: number, locale: "nl" | "en" = "nl"): string {
  const format = (value: number, digits: number) =>
    new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-GB", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${format(kb, 0)} kB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${format(mb, mb < 10 ? 1 : 0)} MB`;
  return `${format(mb / 1024, 2)} GB`;
}
