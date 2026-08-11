import { isChoiceType } from "./schema";
import type { AnswerValue } from "./visibility";

/**
 * Springen tussen secties.
 *
 * Een sectie heeft een standaardvervolg (de volgende in volgorde, of eentje dat
 * de beheerder aanwees), en een keuzeoptie kan dat overrulen: "kies je nee, ga
 * dan meteen naar het einde". Deze module rekent uit welke secties een bezoeker
 * daardoor te zien krijgt.
 *
 * Puur en gedeeld, net als `visibility.ts`: de publieke pagina gebruikt dit om
 * de stappen te tonen, en de server gebruikt het opnieuw bij het indienen. Zonder
 * die tweede keer zou een veld in een overgeslagen sectie nog altijd verplicht
 * kunnen zijn, of zou iemand een antwoord kunnen opsturen op een vraag die zijn
 * pad nooit passeerde.
 */

export type BranchSection = {
  id: string;
  sortOrder: number;
  nextSectionId: string | null;
  endsForm: boolean;
};

export type BranchField = {
  id: string;
  type: string;
  sectionId: string | null;
  sortOrder: number;
};

export type BranchOption = {
  fieldId: string;
  code: string;
  nextSectionId: string | null;
  endsForm: boolean;
};

/**
 * De sprong die uit de antwoorden op deze velden volgt.
 *
 * `undefined` betekent: geen enkel antwoord zegt iets, volg het standaardpad.
 * `null` betekent: het formulier eindigt hier.
 */
function routeFromFields(
  fields: readonly BranchField[],
  options: readonly BranchOption[],
  answers: Readonly<Record<string, AnswerValue>>,
  visible: ReadonlySet<string> | null
): string | null | undefined {
  // We nemen de eerste keuzevraag die iets aanwijst; meerdere routerende vragen
  // in één stap is een tegenspraak die de editor tegenhoudt.
  const ordered = [...fields]
    .filter((field) => !visible || visible.has(field.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const field of ordered) {
    if (!isChoiceType(field.type)) continue;
    const chosen = answers[field.id]?.options ?? [];
    if (chosen.length === 0) continue;

    for (const code of chosen) {
      const option = options.find(
        (candidate) => candidate.fieldId === field.id && candidate.code === code
      );
      if (!option) continue;
      if (option.endsForm) return null;
      if (option.nextSectionId) return option.nextSectionId;
    }
  }
  return undefined;
}

/** De sectie waar de bezoeker na `section` belandt, of null bij het einde. */
function nextAfter(
  section: BranchSection,
  ordered: readonly BranchSection[],
  fields: readonly BranchField[],
  options: readonly BranchOption[],
  answers: Readonly<Record<string, AnswerValue>>,
  visible: ReadonlySet<string> | null
): string | null {
  const routed = routeFromFields(
    fields.filter((field) => field.sectionId === section.id),
    options,
    answers,
    visible
  );
  if (routed !== undefined) return routed;

  if (section.endsForm) return null;
  if (section.nextSectionId) return section.nextSectionId;

  const index = ordered.findIndex((candidate) => candidate.id === section.id);
  return ordered[index + 1]?.id ?? null;
}

/**
 * De secties die dit antwoordenpatroon aandoet, in volgorde.
 *
 * Een sectie die al bezocht is, stopt het pad: een kring tussen twee secties
 * zou anders eeuwig doorlopen. De editor houdt zulke kringen tegen, maar oudere
 * data of een half verwijderde sectie mag geen bevriezing opleveren.
 */
export function sectionPath(
  sections: readonly BranchSection[],
  fields: readonly BranchField[],
  options: readonly BranchOption[],
  answers: Readonly<Record<string, AnswerValue>>,
  visible: ReadonlySet<string> | null = null
): string[] {
  const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordered.length === 0) return [];

  const byId = new Map(ordered.map((section) => [section.id, section]));
  const path: string[] = [];
  const seen = new Set<string>();

  // De velden zonder sectie zijn de eerste stap, en die mag net zo goed
  // sturen: staat de vraag "kom je?" bovenaan buiten elke sectie, dan hoort
  // haar antwoord te bepalen welke sectie volgt.
  const looseRoute = routeFromFields(
    fields.filter((field) => !field.sectionId),
    options,
    answers,
    visible
  );
  if (looseRoute === null) return [];

  let current: string | null = looseRoute ?? ordered[0].id;
  while (current) {
    const section = byId.get(current);
    // Een verwijderde doelsectie: dan stopt het pad hier in plaats van te
    // verwijzen naar iets dat niet bestaat.
    if (!section || seen.has(current)) break;
    seen.add(current);
    path.push(current);
    current = nextAfter(section, ordered, fields, options, answers, visible);
  }

  return path;
}

/**
 * De velden die op het pad liggen. Velden zonder sectie horen bij de eerste
 * stap en doen dus altijd mee.
 */
export function fieldsOnPath(
  fields: readonly BranchField[],
  path: readonly string[]
): Set<string> {
  const onPath = new Set(path);
  return new Set(
    fields
      .filter((field) => !field.sectionId || onPath.has(field.sectionId))
      .map((field) => field.id)
  );
}

/**
 * De stappen van het formulier: eerst de velden zonder sectie (als die er zijn),
 * daarna elke sectie op het pad. Voedt de voortgangsbalk en de vorige/volgende-
 * knoppen.
 */
export function steps(
  sections: readonly BranchSection[],
  fields: readonly BranchField[],
  options: readonly BranchOption[],
  answers: Readonly<Record<string, AnswerValue>>,
  visible: ReadonlySet<string> | null = null
): Array<{ sectionId: string | null }> {
  const looseFields = fields.filter(
    (field) => !field.sectionId && (!visible || visible.has(field.id))
  );
  const path = sectionPath(sections, fields, options, answers, visible);
  return [
    ...(looseFields.length > 0 || path.length === 0 ? [{ sectionId: null }] : []),
    ...path.map((sectionId) => ({ sectionId })),
  ];
}

/**
 * Zou deze sprong een kring maken? De editor weigert ze dan meteen; bij het
 * indienen is het te laat, want dan staat er een formulier online waar je niet
 * meer uit geraakt.
 */
export function wouldLoop(
  sections: readonly BranchSection[],
  candidate: { fromSectionId: string; toSectionId: string }
): boolean {
  if (candidate.fromSectionId === candidate.toSectionId) return true;

  // Enkel de standaardsprongen kunnen een gegarandeerde kring maken; een sprong
  // via een optie is altijd te vermijden door een ander antwoord te kiezen.
  const nextById = new Map(
    sections.map((section) => [
      section.id,
      section.id === candidate.fromSectionId ? candidate.toSectionId : section.nextSectionId,
    ])
  );

  const seen = new Set<string>();
  let current: string | null | undefined = candidate.toSectionId;
  while (current) {
    if (current === candidate.fromSectionId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = nextById.get(current) ?? null;
  }
  return false;
}
