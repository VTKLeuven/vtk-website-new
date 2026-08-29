/**
 * Waar het formulier van een contentpagina in de tekst komt te staan.
 *
 * Een pagina draagt hoogstens een formulier (`Form.pageId` is uniek). De
 * redacteur bepaalt de plaats door een markering op een eigen regel in de
 * markdown te zetten; staat ze er niet, dan komt het formulier onderaan. Dat is
 * bewust geen keuzelijst met drie posities: de tekst zelf weet het beste waar de
 * inschrijving hoort, en een markering die je ziet staan is duidelijker dan een
 * instelling in een ander paneel.
 *
 * Puur, dus deelbaar met de client (het paginabeheer toont de markering ook).
 */

/** De markering die de redacteur in de markdown zet. */
export const FORM_MARKER = "[[formulier]]";

/**
 * De markering staat alleen op haar eigen regel. Zo blijft `[[formulier]]`
 * midden in een zin gewoon tekst, en snijdt de splitsing altijd tussen twee
 * blokken in plaats van een alinea doormidden.
 */
const MARKER_LINE = /^[ \t]*\[\[[ \t]*formulier[ \t]*\]\][ \t]*$/im;

/** Het anker van het formulierpaneel; ook de bestemming van de rail-knop. */
export const FORM_ANCHOR = "formulier";

/**
 * Splitst de markdown op de eerste markering. `after` is `null` wanneer de
 * markering er niet in staat; het formulier hoort dan onderaan.
 *
 * Enkel de eerste telt: een tweede markering blijft gewoon in de tekst staan en
 * valt daardoor op, wat beter is dan stil de verkeerde van de twee kiezen.
 */
export function splitOnFormMarker(markdown: string): { before: string; after: string | null } {
  const match = MARKER_LINE.exec(markdown);
  if (!match) return { before: markdown, after: null };
  return {
    before: markdown.slice(0, match.index).replace(/\s+$/, ""),
    after: markdown.slice(match.index + match[0].length).replace(/^\n+/, ""),
  };
}

/**
 * De markering weghalen zonder te splitsen. Nodig wanneer er (nog) geen
 * formulier aan de pagina hangt: dan mag `[[formulier]]` niet als losse regel
 * tekst op de site verschijnen.
 */
export function stripFormMarker(markdown: string): string {
  const { before, after } = splitOnFormMarker(markdown);
  if (after === null) return markdown;
  if (!after) return before;
  return `${before}\n\n${after}`;
}

/** Staat de markering in deze tekst? Voor de melding in het paginabeheer. */
export function hasFormMarker(markdown: string): boolean {
  return MARKER_LINE.test(markdown);
}
