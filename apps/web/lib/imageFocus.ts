/**
 * Het punt van een foto dat in beeld moet blijven wanneer ze bijgesneden wordt.
 *
 * Een eventfoto verschijnt op drie plaatsen in drie verhoudingen (16/9 op de
 * homepage, 16/10 op de eventpagina, 4/3 op een telefoon), dus één vaste
 * uitsnede bestaat niet. In plaats van de upload te versnijden bewaren we waar
 * het zwaartepunt ligt en geven we dat als `object-position` mee: elk formaat
 * snijdt dan rond hetzelfde punt, en de keuze blijft achteraf te verleggen.
 *
 * Waarden lopen van 0 tot 1 met (0, 0) linksboven, dezelfde as als
 * `object-position` zelf. Het midden is de standaard: dat is precies wat de
 * browser zonder deze waarde doet.
 */

export type ImageFocus = { x: number; y: number };

export const CENTER_FOCUS: ImageFocus = { x: 0.5, y: 0.5 };

/**
 * Eén as, geknipt op [0, 1]; alles wat geen getal is valt terug op het midden.
 *
 * Ontbrekende waarden worden apart afgevangen: `Number(null)` en `Number("")`
 * zijn 0, dus een leeg formulierveld of een kolom die nog `null` is zou anders
 * stil de linkerbovenhoek betekenen in plaats van het midden.
 */
export function clampFocusAxis(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0.5;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.min(1, Math.max(0, num));
}

export function toImageFocus(x: unknown, y: unknown): ImageFocus {
  return { x: clampFocusAxis(x), y: clampFocusAxis(y) };
}

/**
 * De waarde voor `object-position`. Met één cijfer na de komma: meer precisie
 * dan een tiende procent ziet niemand, en het houdt de HTML kort.
 */
export function focusPosition(focus: ImageFocus | null | undefined): string {
  const { x, y } = focus ?? CENTER_FOCUS;
  return `${(clampFocusAxis(x) * 100).toFixed(1)}% ${(clampFocusAxis(y) * 100).toFixed(1)}%`;
}

/**
 * Leest het punt uit een `FormData`, zoals `ImageFocusField` het meestuurt.
 * Ontbreekt het veld (een ouder formulier, of een veld dat niet getoond wordt),
 * dan is het antwoord het midden en niet een fout: dit is een verfijning, geen
 * verplichte invoer.
 */
export function readImageFocus(formData: FormData, name = "imageFocus"): ImageFocus {
  return toImageFocus(formData.get(`${name}X`), formData.get(`${name}Y`));
}
