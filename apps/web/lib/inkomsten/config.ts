/**
 * De instellingen van /admin/inkomsten (Setting `income.config`), als pure
 * functie gelezen zodat het zonder database te testen is. Niets over VTK zelf
 * als standaard: zonder instelling is er geen kostencode en telt elke kost.
 */
import { NO_SEPARATE_FEES, type LineRules } from "./lines";
import type { IncomeSourceCode } from "./parse";

export const INCOME_CONFIG_KEY = "income.config";

/** De bronnen met kostenregels: enkel daarvoor heeft "aparte factuur" zin. Payconiq houdt niets in. */
export const SOURCES_WITH_FEES: readonly IncomeSourceCode[] = ["MOLLIE", "SUMUP", "EUROPABANK"];

export type IncomeConfig = {
  /**
   * De code voor de kosten van Mollie, SumUp en Europabank. Geen
   * standaard: Beheer kiest ze, net als elke andere code van de kring.
   */
  feeAccountingCodeId: string | null;
  /**
   * De bronnen waarvan de kosten op een aparte factuur komen die de boekhouder
   * zelf inboekt: die tellen niet in het overzicht (zie `LineRules`).
   */
  separateFeeSources: IncomeSourceCode[];
};

/** Wat er in de database staat, voorzichtig gelezen: wat niet klopt, valt weg. */
export function parseIncomeConfig(value: unknown): IncomeConfig {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const sources = Array.isArray(record.separateFeeSources) ? record.separateFeeSources : [];
  return {
    feeAccountingCodeId: typeof record.feeAccountingCodeId === "string" && record.feeAccountingCodeId ? record.feeAccountingCodeId : null,
    separateFeeSources: SOURCES_WITH_FEES.filter((source) => sources.includes(source)),
  };
}

export function lineRulesOf(config: IncomeConfig): LineRules {
  return config.separateFeeSources.length ? { separateFeeSources: new Set(config.separateFeeSources) } : NO_SEPARATE_FEES;
}
