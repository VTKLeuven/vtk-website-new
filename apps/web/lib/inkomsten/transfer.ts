/**
 * Een overschrijving die iemand rechtstreeks op een rekening van de kring deed
 * ("de Overschrijvingen" van het oude rekenblad), als pure functies: wat de
 * server nakijkt voor hij er een bewaart. Er is geen export voor; Beheer voert
 * ze per stuk in, met de rekening en de code. Zie `transferServer.ts`.
 */
import { brusselsWallClockMinutes, parseYMD, ymdKey } from "@/lib/brussels";
import { parseAmountToCents } from "@/lib/rekeningen/expenses";

/** `IncomeImport.format` van een overschrijving met de hand: geen bestand, niet in de lijst van Uploaden. */
export const MANUAL_FORMAT = "manual";

/** Zo lang mag de omschrijving zijn; de naam van wie stortte hoort er niet in. */
export const TRANSFER_DESCRIPTION_MAX = 200;

export type TransferFields = {
  /** "2026-09-16" */
  day: string;
  /** Positief: een storting. Negatief: een terugbetaling per overschrijving. */
  amountCents: number;
  bankAccount: string;
  description: string | null;
};

export type TransferCheck = ({ ok: true } & TransferFields) | { ok: false; error: "BAD_DATE" | "BAD_AMOUNT" | "ACCOUNT_REQUIRED" };

/**
 * Een bedrag zoals Beheer het tikt: "12,50", "1.234,56", "12.50". Met een min
 * ervoor is het een terugbetaling.
 */
export function parseTransferAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/^€\s*/, "");
  const negative = /^[-−]/.test(trimmed);
  const cents = parseAmountToCents(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/** Wat het formulier stuurde, nagekeken. */
export function checkTransfer(input: { day: string; amount: string; bankAccount: string; description: string }): TransferCheck {
  const ymd = parseYMD(input.day.trim());
  if (!ymd) return { ok: false, error: "BAD_DATE" };
  const amountCents = parseTransferAmount(input.amount);
  if (amountCents === null) return { ok: false, error: "BAD_AMOUNT" };
  const bankAccount = input.bankAccount.trim();
  if (!bankAccount) return { ok: false, error: "ACCOUNT_REQUIRED" };
  const description = input.description.replace(/\s+/g, " ").trim().slice(0, TRANSFER_DESCRIPTION_MAX) || null;
  return { ok: true, day: ymdKey(ymd), amountCents, bankAccount, description };
}

/**
 * Het moment van een overschrijving: 12:00 op die dag, op de Brusselse klok. Een
 * overschrijving heeft enkel een dag, en zo valt ze nooit in een andere maand,
 * ook niet op een dag in Na te kijken (van 9:00 tot 9:00).
 */
export function transferMoment(day: string): Date {
  const ymd = parseYMD(day);
  if (!ymd) throw new Error(`Geen dag: ${day}`);
  return brusselsWallClockMinutes(ymd, 12 * 60);
}
