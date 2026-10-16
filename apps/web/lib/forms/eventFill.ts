import {
  EVENT_FILL_KEYS,
  EVENT_FILL_TARGET_TYPES,
  type EventFillKey,
  type FormFieldConfig,
} from "./schema";
import type { AnswerValue } from "./visibility";

/**
 * Een evenementveld kiezen vult andere velden mee in (titel, datum, uren,
 * locatie, post). Die velden blijven gewone antwoorden: de bezoeker kan ze nog
 * aanpassen, en de export en de PDF lezen ze zoals elk ander veld.
 *
 * Puur en zonder server-imports: de client roept dit bij elke keuze aan, de
 * server bij een prefill-link (`?evenement=<id>`).
 */

/** De waarden van één evenement, al in de tijdzone van Brussel geschreven. */
export type EventFillValues = {
  title: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm, of null bij een evenement van de hele dag. */
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  groupSlug: string;
  groupName: string;
};

/** Eén evenement zoals het in de keuzelijst staat. */
export type EventChoice = {
  id: string;
  /** "di 21 okt, Cantus" */
  label: string;
  /** Van een post waar de bezoeker lid van is: die staan bovenaan. */
  own: boolean;
  /** Nog niet gepubliceerd; enkel zichtbaar voor de eigen post. */
  draft: boolean;
  fill: EventFillValues;
};

export type FillField = {
  id: string;
  code: string;
  type: string;
  config: FormFieldConfig;
  options: ReadonlyArray<{ code: string }>;
};

function valueFor(key: EventFillKey, target: FillField, choice: EventChoice | null): AnswerValue | null {
  if (!choice) return null;
  const fill = choice.fill;
  switch (key) {
    case "TITLE":
      return { text: fill.title };
    case "DATE":
      return { text: fill.date };
    case "START_TIME":
      return fill.startTime ? { text: fill.startTime } : null;
    case "END_TIME":
      return fill.endTime ? { text: fill.endTime } : null;
    case "LOCATION":
      return fill.location ? { text: fill.location } : null;
    case "POST":
      if (target.options.some((option) => option.code === fill.groupSlug)) {
        return { options: [fill.groupSlug], text: null };
      }
      // Een post die geen eigen optie heeft, komt in "Andere, namelijk".
      return target.config.allowOther ? { options: [], text: fill.groupName } : null;
  }
}

function isEmpty(value: AnswerValue | undefined): boolean {
  if (!value) return true;
  return !value.text?.trim() && (value.options?.length ?? 0) === 0;
}

function sameAnswer(a: AnswerValue | undefined, b: AnswerValue): boolean {
  if (!a) return false;
  const textA = a.text?.trim() ?? "";
  const textB = b.text?.trim() ?? "";
  const optionsA = a.options ?? [];
  const optionsB = b.options ?? [];
  return (
    textA === textB &&
    optionsA.length === optionsB.length &&
    optionsA.every((code, index) => code === optionsB[index])
  );
}

/**
 * Zet het evenementveld op `next` en vult de doelvelden in.
 *
 * Een doelveld wordt enkel overschreven als het leeg is, of als het nog precies
 * de waarde van het vorige evenement draagt. Wat de bezoeker met de hand
 * aanpaste, blijft dus staan wanneer die een ander evenement kiest; wie het
 * evenement leegmaakt, ziet enkel de meegevulde waarden verdwijnen.
 */
export function applyEventFill(
  answers: Readonly<Record<string, AnswerValue>>,
  fields: readonly FillField[],
  eventField: FillField,
  next: EventChoice | null,
  previous: EventChoice | null
): Record<string, AnswerValue> {
  const result: Record<string, AnswerValue> = {
    ...answers,
    [eventField.id]: next ? { text: next.id } : {},
  };
  const fills = eventField.config.fills ?? {};

  for (const key of EVENT_FILL_KEYS) {
    const code = fills[key];
    if (!code) continue;
    const target = fields.find((field) => field.code === code);
    if (!target || target.id === eventField.id) continue;
    if (!EVENT_FILL_TARGET_TYPES[key].includes(target.type)) continue;

    const current = result[target.id];
    const before = valueFor(key, target, previous);
    if (!isEmpty(current) && !(before && sameAnswer(current, before))) continue;

    result[target.id] = valueFor(key, target, next) ?? {};
  }

  return result;
}
