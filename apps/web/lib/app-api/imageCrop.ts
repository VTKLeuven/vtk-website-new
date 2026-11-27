import { clampFocusAxis, mobileCropFrom, type ImageCrop } from "@/lib/imageFocus";
import type { AppImageCrop } from "@/lib/app-api/contract";

/** De kolommen van een evenement waar de uitsneden in staan. */
type CropColumns = {
  imageKey?: string | null;
  imageFocusX?: number | null;
  imageFocusY?: number | null;
  imageFocusMobileX?: number | null;
  imageFocusMobileY?: number | null;
  imageZoomMobile?: number | null;
  imageRatioMobile?: number | null;
  imageFocusAppX?: number | null;
  imageFocusAppY?: number | null;
  imageZoomApp?: number | null;
  imageRatioApp?: number | null;
};

/**
 * De uitsnede van een eventfoto voor de app.
 *
 * `event` is de rij zelf, `shown` het evenement zoals het er nu uitziet
 * (`eventAsOfNow`): heeft het eerstvolgende moment een eigen affiche, dan staat
 * die in `shown`, met haar eigen punt. De app- en telefoonuitsnede zijn voor de
 * affiche van het evenement gekozen en gelden voor die andere foto dus niet;
 * dezelfde regel als `ownPoster` op de eventpagina.
 *
 * Voor de grote foto bovenaan geldt de eigen app-uitsnede, en anders die van
 * een telefoon (4/3 ligt het dichtst bij het kader van de app), en anders het
 * gewone punt. Zonder eigen foto (de standaardbanner van een thema) is het
 * antwoord `null`: die snijdt rond het midden, zoals op de site.
 */
export function appImageCrop(event: CropColumns, shown: CropColumns = event): AppImageCrop | null {
  if (!shown.imageKey) return null;
  const focus = { x: clampFocusAxis(shown.imageFocusX), y: clampFocusAxis(shown.imageFocusY) };
  const ownPoster = shown.imageKey !== event.imageKey;
  const chosen: ImageCrop | null = ownPoster
    ? null
    : (mobileCropFrom(event.imageFocusAppX, event.imageFocusAppY, event.imageZoomApp, event.imageRatioApp) ??
      mobileCropFrom(
        event.imageFocusMobileX,
        event.imageFocusMobileY,
        event.imageZoomMobile,
        event.imageRatioMobile,
      ));
  if (!chosen) return { focus, hero: { ...focus, zoom: 1, ratio: null } };
  return {
    focus,
    hero: {
      ...chosen.focus,
      // Uitzoomen kan enkel met de verhouding van de foto; zonder draait de app
      // enkel rond het punt, net als de site (`photoCropStyle`).
      zoom: chosen.ratio ? chosen.zoom : 1,
      ratio: chosen.ratio,
    },
  };
}
