/**
 * Verplichte velden aanwijzen wanneer iemand toch op indienen klikt (R7).
 *
 * De knop stond uitgeschakeld tot alles ingevuld was. Dat is geen feedback maar
 * een raadsel: je ziet dat je niet verder kan en niet waarom. De knop mag nu
 * altijd geklikt worden; wat ontbreekt, krijgt een rode rand en het scherm
 * springt ernaartoe.
 */
export type MissingField = { name: string; message: string };

/**
 * De eerste ontbrekende uit een lijst regels, in de volgorde waarin ze op het
 * scherm staan. Eén tegelijk: vijf rode randen tegelijk laten je opnieuw zoeken
 * waar je moet beginnen.
 */
export function firstMissing(
  rules: Array<{ name: string; ok: boolean; message: string }>
): MissingField | null {
  const missing = rules.find((rule) => !rule.ok);
  return missing ? { name: missing.name, message: missing.message } : null;
}

/**
 * Scrolt naar het veld en zet de cursor erin. Werkt op `name` en niet op een
 * ref, zodat een formulier zijn regels als data kan opschrijven in plaats van
 * per veld een ref te moeten rondsturen.
 */
export function focusField(name: string): void {
  const element = document.querySelector<HTMLElement>(`[data-field="${name}"]`);
  if (!element) return;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // Focus na het scrollen: focus zelf scrollt ook, en dan springt het scherm
  // twee keer.
  window.setTimeout(() => element.focus({ preventScroll: true }), 250);
}

/**
 * De rode rand op het veld dat ontbreekt.
 *
 * Met `!` erachter: de basisklasse draagt al een `border-...`-kleur, en welke
 * van de twee wint hangt anders af van de volgorde in de gegenereerde
 * stylesheet, niet van de volgorde in het attribuut.
 */
export function fieldClass(base: string, name: string, missing: MissingField | null): string {
  return missing?.name === name ? `${base} border-red-500! ring-1 ring-red-500` : base;
}
