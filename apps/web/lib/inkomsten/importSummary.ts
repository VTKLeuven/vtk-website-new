/**
 * De voorvertoning van meerdere gekozen bestanden samen, voor het opladen op
 * /admin/inkomsten. Puur, zodat het formulier en de tests dezelfde som maken.
 */
import type { ImportSummary } from "./server";

export type CombinedImportSummary = {
  sources: ImportSummary["source"][];
  total: number;
  skipped: number;
  ignored: number;
  created: number;
  duplicates: number;
  updated: number;
  locked: number;
  feeRows: number;
  rules: ImportSummary["rules"];
  firstAt: Date | null;
  lastAt: Date | null;
  /** Elk nieuw kanaal één keer, ook als het in meerdere bestanden staat. */
  newChannels: string[];
  /** Een Mollie-bestand met betalingen maar zonder één kosten- of reserveregel. */
  mollieWithoutFees: boolean;
};

/**
 * Tel de voorvertoningen op. Een datum kan als tekst binnenkomen: de
 * voorvertoning reist van de server action naar de browser.
 */
export function combineImportSummaries(summaries: readonly ImportSummary[]): CombinedImportSummary {
  const totals: CombinedImportSummary = {
    sources: [],
    total: 0,
    skipped: 0,
    ignored: 0,
    created: 0,
    duplicates: 0,
    updated: 0,
    locked: 0,
    feeRows: 0,
    rules: { WEBSITE: 0, CODE_IN_TEXT: 0, NAME_RULE: 0, CHANNEL_DEFAULT: 0, OPEN: 0 },
    firstAt: null,
    lastAt: null,
    newChannels: [],
    mollieWithoutFees: false,
  };
  for (const summary of summaries) {
    if (!totals.sources.includes(summary.source)) totals.sources.push(summary.source);
    totals.total += summary.total;
    totals.skipped += summary.skipped;
    totals.ignored += summary.ignored;
    totals.created += summary.created;
    totals.duplicates += summary.duplicates;
    totals.updated += summary.updated;
    totals.locked += summary.locked;
    totals.feeRows += summary.feeRows;
    for (const key of Object.keys(totals.rules) as Array<keyof ImportSummary["rules"]>) totals.rules[key] += summary.rules[key];
    const first = summary.firstAt ? new Date(summary.firstAt) : null;
    const last = summary.lastAt ? new Date(summary.lastAt) : null;
    if (first && (!totals.firstAt || first < totals.firstAt)) totals.firstAt = first;
    if (last && (!totals.lastAt || last > totals.lastAt)) totals.lastAt = last;
    for (const name of summary.newChannels) if (!totals.newChannels.includes(name)) totals.newChannels.push(name);
    if (summary.format === "mollie" && summary.feeRows === 0 && summary.created > 0) totals.mollieWithoutFees = true;
  }
  return totals;
}
