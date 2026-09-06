/**
 * Een reeks foto's die in de tekst van een pagina naast elkaar staat.
 *
 * Er is bewust geen eigen syntax voor: **twee of meer afbeeldingen die in de
 * markdown tegen elkaar aan staan, vormen samen een galerij.** Een lege regel
 * ertussen splitst ze weer in losse foto's, en een enkele afbeelding blijft de
 * foto die ze altijd was. Een markering zoals `[[galerij]]` zou de redacteur
 * iets extra's leren, terwijl "de foto's staan onder elkaar" precies is wat je
 * al doet als je er drie na elkaar uploadt.
 *
 * De maten van elke foto staan in de URL (`?w=1600&h=1067`), geschreven door de
 * uploadroute. Zonder die maten is er voor het laden niets te weten over de
 * verhouding van een foto, en valt een uitgevulde strook dus niet te tekenen
 * zonder dat ze bij elke geladen foto verspringt; de galerij valt dan terug op
 * een raster met een vaste uitsnede. Zie docs/design-decisions.md.
 */

import type { Element } from "hast";
import { isVideoUrl } from "./videoEmbed";

export type GalleryPhoto = {
  src: string;
  /** De alt-tekst uit de markdown; ook het bijschrift in het vergrootglas. */
  alt: string;
  /** De titel uit de markdown (`![alt](url "titel")`); het bijschrift onder een
   *  losstaande foto. Null wanneer de redacteur er geen gaf. */
  title: string | null;
  /** De maten uit de URL, of null wanneer die er niet in staan. */
  width: number | null;
  height: number | null;
};

/** Een foto van meer dan 25k pixels breed bestaat niet; dan is de query rommel. */
const MAX_DIMENSION = 25000;

/** De maten die de uploadroute in de URL schreef, of null. */
export function imageSize(src: string): { width: number; height: number } | null {
  const query = src.indexOf("?");
  if (query === -1) return null;

  const params = new URLSearchParams(src.slice(query + 1));
  const width = Number(params.get("w"));
  const height = Number(params.get("h"));
  if (!isSize(width) || !isSize(height)) return null;

  return { width, height };
}

function isSize(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;
}

/**
 * Hangt de maten aan een geüploade afbeelding. De mediaroute negeert de query,
 * dus dit blijft dezelfde afbeelding; enkel de renderkant leest ze.
 */
export function withImageSize(url: string, width: number, height: number): string {
  if (!isSize(width) || !isSize(height)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}w=${width}&h=${height}`;
}

/**
 * De foto's van een alinea die niets anders bevat dan afbeeldingen, of null
 * wanneer het gewoon een alinea is.
 *
 * De regeleindes tussen de afbeeldingen zijn tekstknopen met enkel witruimte;
 * die tellen niet mee. Elke andere inhoud (een woord, een link, een cursief
 * stukje) maakt er weer een gewone alinea van: dan is de afbeelding een
 * illustratie in een zin en geen reeks.
 *
 * Video's blijven buiten de galerij. Een YouTube-link staat in de markdown als
 * `![Titel](url)` en zou anders als foto in de strook belanden.
 */
export function galleryPhotos(node: Element | undefined): GalleryPhoto[] | null {
  const photos = paragraphPhotos(node);
  return photos && photos.length >= 2 ? photos : null;
}

/**
 * De ene foto van een alinea die verder niets bevat, of null.
 *
 * De tegenhanger van {@link galleryPhotos}: twee of meer foto's worden een
 * galerij, eentje wordt een figuur met een bijschrift. Beide lezen dezelfde
 * alinea, dus ze horen bij elkaar te blijven staan.
 */
export function solePhoto(node: Element | undefined): GalleryPhoto | null {
  const photos = paragraphPhotos(node);
  return photos && photos.length === 1 ? photos[0] : null;
}

/** De foto's van een alinea die niets anders bevat, of null. */
function paragraphPhotos(node: Element | undefined): GalleryPhoto[] | null {
  if (!node || !Array.isArray(node.children)) return null;

  const photos: GalleryPhoto[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      if (child.value.trim() === "") continue;
      return null;
    }
    if (child.type !== "element" || child.tagName !== "img") return null;

    const src = typeof child.properties?.src === "string" ? child.properties.src : "";
    if (!src || isVideoUrl(src)) return null;
    const alt = typeof child.properties?.alt === "string" ? child.properties.alt : "";
    const title = typeof child.properties?.title === "string" ? child.properties.title : null;
    const size = imageSize(src);

    photos.push({
      src,
      alt,
      title: title && title.trim() ? title : null,
      width: size?.width ?? null,
      height: size?.height ?? null,
    });
  }

  return photos.length > 0 ? photos : null;
}
