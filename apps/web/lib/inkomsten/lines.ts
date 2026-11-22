/**
 * Op welke regel van het kwartaalblad een transactie telt, of dat ze niet
 * meetelt. Het overzicht op het scherm, het blad voor de boekhouder en het
 * controlebestand rekenen alle drie met deze ene functie: zo kan het scherm
 * nooit iets anders optellen dan het bestand dat naar de boekhouder gaat.
 *
 * Puur, en bewust niet in `workbook.ts`: dat bestand laadt `write-excel-file`,
 * en het overzicht heeft dat niet nodig.
 */
import type { IncomeKindCode, IncomeSourceCode } from "./parse";

/** Wat Beheer in Instellingen bepaalt over wat meetelt. */
export type LineRules = {
  /**
   * Bronnen waarvan de kosten op een aparte factuur komen die de boekhouder
   * zelf inboekt. Hun kostenregels blijven in de database en in de som per
   * uitbetaling (wat op de bank komt, is na de kosten), maar tellen niet in het
   * overzicht: anders boekt de boekhouder ze twee keer.
   */
  separateFeeSources: ReadonlySet<IncomeSourceCode>;
};

/** Niets apart: elke kostenregel telt. Zo rekende de site tot november 2026. */
export const NO_SEPARATE_FEES: LineRules = { separateFeeSources: new Set() };

export type LineTransaction = {
  source: IncomeSourceCode;
  kind: IncomeKindCode;
  accountingCode: string | null;
  excluded: boolean;
};

/** Een kostenregel van een bron met een aparte factuur. */
export function isSeparateFee(tx: Pick<LineTransaction, "source" | "kind">, rules: LineRules): boolean {
  return tx.kind === "FEE" && rules.separateFeeSources.has(tx.source);
}

/**
 * De regel van het kwartaalblad waarin een transactie telt: haar code, of
 * "Kosten", "Reserve" of "Na te kijken". Null als ze niet meetelt: met de hand
 * uitgesloten, of kosten met een aparte factuur.
 */
export function quarterLineKey(tx: LineTransaction, rules: LineRules): string | null {
  if (tx.excluded) return null;
  if (tx.kind === "FEE") return isSeparateFee(tx, rules) ? null : "Kosten";
  if (tx.kind === "RESERVE") return "Reserve";
  return tx.accountingCode ?? "Na te kijken";
}
