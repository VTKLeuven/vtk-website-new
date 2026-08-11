import { isChoiceType } from "./schema";

/**
 * Conditionele zichtbaarheid: veld X toont enkel wanneer veld Y een bepaald
 * antwoord heeft.
 *
 * Deze module is bewust puur en gedeeld: de publieke pagina gebruikt ze om
 * velden te tonen of te verbergen, en de server gebruikt ze opnieuw bij het
 * indienen. Zonder die tweede keer zou een verborgen veld nog altijd verplicht
 * kunnen zijn, of zou een bezoeker een antwoord kunnen opsturen op een vraag
 * die hij nooit gezien heeft.
 */

export type ConditionOperator = "EQUALS" | "NOT_EQUALS" | "INCLUDES" | "IS_ANSWERED";

export type VisibilityCondition = {
  fieldId: string;
  sourceFieldId: string;
  operator: ConditionOperator;
  value: string | null;
};

export type VisibilityField = {
  id: string;
  type: string;
};

/**
 * Het antwoord zoals het publieke formulier het bijhoudt. `options` voor een
 * keuzeveld, `text` voor de rest; `checked` voor ja/nee en toestemming.
 */
export type AnswerValue = {
  text?: string | null;
  number?: number | null;
  checked?: boolean | null;
  options?: string[] | null;
  files?: number | null;
};

function isAnswered(value: AnswerValue | undefined): boolean {
  if (!value) return false;
  if (value.options && value.options.length > 0) return true;
  if (typeof value.checked === "boolean" && value.checked) return true;
  if (value.number !== null && value.number !== undefined) return true;
  if (typeof value.files === "number" && value.files > 0) return true;
  return Boolean(value.text && value.text.trim());
}

/** De waarden waarmee een conditie vergelijkt: opties, of de tekst zelf. */
function comparableValues(value: AnswerValue | undefined, type: string): string[] {
  if (!value) return [];
  if (isChoiceType(type)) return value.options ?? [];
  if (typeof value.checked === "boolean") return [value.checked ? "true" : "false"];
  if (value.number !== null && value.number !== undefined) return [String(value.number)];
  return value.text ? [value.text] : [];
}

function matches(
  condition: VisibilityCondition,
  sourceType: string,
  answer: AnswerValue | undefined
): boolean {
  const values = comparableValues(answer, sourceType);
  switch (condition.operator) {
    case "IS_ANSWERED":
      return isAnswered(answer);
    case "EQUALS":
      return condition.value !== null && values.length === 1 && values[0] === condition.value;
    case "NOT_EQUALS":
      // Een onbeantwoorde bronvraag is niet "verschillend van X": zo zou het
      // afhankelijke veld al zichtbaar zijn voor er iets ingevuld is.
      return condition.value !== null && isAnswered(answer) && !values.includes(condition.value);
    case "INCLUDES":
      return condition.value !== null && values.includes(condition.value);
    default:
      return false;
  }
}

/**
 * Welke velden zichtbaar zijn, gegeven de huidige antwoorden.
 *
 * Meerdere condities op hetzelfde veld gelden samen (AND). Een veld waarvan de
 * bron zelf verborgen is, is ook verborgen: anders duikt een vraag op door een
 * antwoord dat de bezoeker niet meer kan zien staan.
 */
export function visibleFieldIds(
  fields: readonly VisibilityField[],
  conditions: readonly VisibilityCondition[],
  answers: Readonly<Record<string, AnswerValue>>
): Set<string> {
  const typeById = new Map(fields.map((field) => [field.id, field.type]));
  const conditionsByField = new Map<string, VisibilityCondition[]>();
  for (const condition of conditions) {
    const list = conditionsByField.get(condition.fieldId) ?? [];
    list.push(condition);
    conditionsByField.set(condition.fieldId, list);
  }

  const visible = new Set<string>();
  const resolving = new Set<string>();

  function isVisible(fieldId: string): boolean {
    if (visible.has(fieldId)) return true;
    const rules = conditionsByField.get(fieldId);
    if (!rules || rules.length === 0) return true;
    // Een kring hoort in de editor tegengehouden te worden; komt ze er toch
    // door, dan tonen we het veld liever dan oneindig te blijven zoeken.
    if (resolving.has(fieldId)) return true;

    resolving.add(fieldId);
    try {
      return rules.every((rule) => {
        if (!typeById.has(rule.sourceFieldId)) return false;
        if (!isVisible(rule.sourceFieldId)) return false;
        return matches(rule, typeById.get(rule.sourceFieldId) ?? "", answers[rule.sourceFieldId]);
      });
    } finally {
      resolving.delete(fieldId);
    }
  }

  for (const field of fields) {
    if (isVisible(field.id)) visible.add(field.id);
  }
  return visible;
}

/**
 * Zou een conditie een kring maken? De editor weigert ze dan meteen, want bij
 * het indienen is het te laat: dan staat er een formulier online waarvan
 * niemand kan zeggen welke velden zichtbaar horen te zijn.
 */
export function wouldCreateCycle(
  conditions: readonly VisibilityCondition[],
  candidate: { fieldId: string; sourceFieldId: string }
): boolean {
  if (candidate.fieldId === candidate.sourceFieldId) return true;

  const sourcesByField = new Map<string, string[]>();
  for (const condition of [...conditions, { ...candidate, operator: "EQUALS" as const, value: null }]) {
    const list = sourcesByField.get(condition.fieldId) ?? [];
    list.push(condition.sourceFieldId);
    sourcesByField.set(condition.fieldId, list);
  }

  const seen = new Set<string>();
  const stack = [candidate.sourceFieldId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === candidate.fieldId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(sourcesByField.get(current) ?? []));
  }
  return false;
}
