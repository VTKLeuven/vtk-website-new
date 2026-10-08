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

/**
 * Een eigen uitsnede voor een telefoon: een middelpunt én een zoom.
 *
 * Op een telefoon toont de eventpagina de foto in 4/3, en een liggende affiche
 * verliest daar links en rechts het meest; net daar staan vaak de logo's. Eén
 * punt voor alle formaten volstaat dan niet, en verschuiven alleen ook niet:
 * wat links en rechts tegelijk wegvalt, krijg je enkel terug door uit te zoomen.
 *
 * De zoom is een factor op het kader net gevuld (1). Groter zoomt in, kleiner
 * zoomt uit; dan past de foto niet meer van rand tot rand en vult een vervaagde
 * kopie van dezelfde foto de rest (`.vtk-event-photo-fill`). Bewust een factor
 * en geen pixels: het kader is op elke telefoon anders breed.
 *
 * `ratio` is de verhouding van de foto (breedte gedeeld door hoogte), gemeten
 * in het beheer. Uitzoomen gaat niet met `object-fit: cover` plus een
 * `transform`: cover snijdt in een kader altijd hetzelfde deel weg, en schalen
 * verkleint enkel wat er al overbleef. De pagina rekent de afmetingen van de
 * foto dus zelf uit ({@link cropBox}), en daar is de verhouding voor nodig.
 * Zonder verhouding draait de telefoon enkel rond het eigen punt, zonder zoom.
 */
export type ImageCrop = { focus: ImageFocus; zoom: number; ratio: number | null };

export const MIN_IMAGE_ZOOM = 0.5;
export const MAX_IMAGE_ZOOM = 2;

/** De zoom, geknipt op het bereik; alles wat geen getal is, is 1 (geen zoom). */
export function clampImageZoom(value: unknown): number {
  if (value === null || value === undefined || value === "") return 1;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, num));
}

/** Een verhouding die ergens op slaat (tussen 1:10 en 10:1), of null. */
export function imageRatioFrom(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num >= 0.1 && num <= 10 ? num : null;
}

/**
 * De telefoonuitsnede uit de kolommen van een evenement, of `null` wanneer de
 * telefoon de gewone uitsnede volgt. Het punt beslist: zonder punt geen eigen
 * uitsnede, ook al zou er nog een zoom staan.
 */
export function mobileCropFrom(
  x: number | null | undefined,
  y: number | null | undefined,
  zoom: number | null | undefined,
  ratio: number | null | undefined,
): ImageCrop | null {
  if (x === null || x === undefined || y === null || y === undefined) return null;
  return { focus: toImageFocus(x, y), zoom: clampImageZoom(zoom), ratio: imageRatioFrom(ratio) };
}

/**
 * Leest de telefoonuitsnede uit een `FormData`, zoals `EventImageField` ze
 * meestuurt: `${name}On`, het punt, `${name}Zoom` en `${name}Ratio`. Staat ze
 * uit, of ontbreekt het veld (een ouder formulier), dan is het antwoord `null`:
 * de telefoon volgt de gewone uitsnede, zoals voordien.
 */
export function readMobileCrop(formData: FormData, name = "imageFocusMobile"): ImageCrop | null {
  if (formData.get(`${name}On`) !== "true") return null;
  return {
    focus: readImageFocus(formData, name),
    zoom: clampImageZoom(formData.get(`${name}Zoom`)),
    ratio: imageRatioFrom(formData.get(`${name}Ratio`)),
  };
}

/**
 * Waar de foto in een kader staat, in procenten van dat kader: de cover-
 * uitsnede rond `focus`, maal `zoom` rond hetzelfde punt. Bij een zoom onder 1
 * is de foto kleiner dan het kader en zijn de procenten voor links of boven
 * positief; daar ligt de vervaagde kopie.
 *
 * `.vtk-event-photo-crop[data-mobile-crop]` rekent hetzelfde uit in CSS, met
 * containereenheden in plaats van een verhouding van het kader; houd ze gelijk.
 */
export function cropBox(
  imageRatio: number,
  frameRatio: number,
  focus: ImageFocus,
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  const width = zoom * Math.max(1, imageRatio / frameRatio) * 100;
  const height = zoom * Math.max(1, frameRatio / imageRatio) * 100;
  return { left: focus.x * (100 - width), top: focus.y * (100 - height), width, height };
}

/**
 * De uitsnede van een foto in `.vtk-event-photo`, als CSS-variabelen op het
 * kader. De stylesheet kiest per schermbreedte welke geldt; zo blijft het één
 * `<img>`, door de server gerenderd, zonder JavaScript die de breedte meet.
 */
export function photoCropStyle(
  focus: ImageFocus | null | undefined,
  mobile: ImageCrop | null | undefined,
): Record<string, string> {
  const style: Record<string, string> = { "--photo-focus": focusPosition(focus) };
  if (mobile) {
    style["--photo-focus-m"] = focusPosition(mobile.focus);
    if (mobile.ratio) {
      style["--photo-fx-m"] = clampFocusAxis(mobile.focus.x).toFixed(4);
      style["--photo-fy-m"] = clampFocusAxis(mobile.focus.y).toFixed(4);
      style["--photo-zoom-m"] = clampImageZoom(mobile.zoom).toFixed(2);
      style["--photo-ratio"] = mobile.ratio.toFixed(4);
    }
  }
  return style;
}

/**
 * De zoom die een foto net helemaal in een kader laat passen, als factor op het
 * kader net gevuld: voor een liggende 16/9-affiche in een 4/3-kader is dat 0,75.
 * Afgerond naar beneden, zodat de randen er zeker in vallen.
 */
export function fitZoom(imageRatio: number, frameRatio: number): number {
  if (!(imageRatio > 0) || !(frameRatio > 0)) return 1;
  const fit = Math.min(frameRatio / imageRatio, imageRatio / frameRatio);
  return clampImageZoom(Math.floor(fit * 100) / 100);
}
