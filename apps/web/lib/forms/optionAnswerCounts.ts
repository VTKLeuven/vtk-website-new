export type OptionAnswerRow = {
  fieldId: string;
  valueOptions: readonly string[];
};

/**
 * Telt per veld en per optie hoeveel antwoordrijen de code bevatten.
 * Optiecodes zijn alleen uniek binnen hun veld, dus twee velden met `ja`
 * mogen nooit in dezelfde teller belanden.
 */
export function optionAnswerCounts(
  answers: readonly OptionAnswerRow[]
): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();

  for (const answer of answers) {
    const byOption = counts.get(answer.fieldId) ?? new Map<string, number>();
    counts.set(answer.fieldId, byOption);
    for (const code of new Set(answer.valueOptions)) {
      byOption.set(code, (byOption.get(code) ?? 0) + 1);
    }
  }

  return counts;
}
