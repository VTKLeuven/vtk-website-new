import { publicUrl } from "@/lib/storage";
import {
  CENTER_FOCUS,
  focusPosition,
  mobileCropFrom,
  type ImageCrop,
  type ImageFocus,
} from "@/lib/imageFocus";

/**
 * De banner van een ticketevent: in de shop, op /tickets, op de bestelpagina,
 * in de bevestigingsmail en in het nieuws.
 *
 * Een ticketevent kiest zijn banner zelf in de instellingen, zodat ook een
 * event zonder kalenderevent er een heeft:
 *
 * 1. een **eigen foto** (`imageKey`, met zijn uitsnede);
 * 2. anders de **standaardbanner van een kalenderthema** (`imageCategory`),
 *    dezelfde die een evenement van dat thema zonder affiche krijgt;
 * 3. anders de foto van het **gekoppelde kalenderevent**, zoals voordien.
 *
 * Een eigen keuze op het ticketevent wint dus van het kalenderevent: wie ze
 * maakt, doet dat op het scherm waar het om de ticketverkoop gaat. Zonder
 * keuze en zonder koppeling is er geen banner, en toont elke plek wat ze
 * daarvoor al deed.
 */

/** Wat de queries moeten ophalen om de banner te kunnen kiezen. */
export const ticketPosterSelect = {
  imageKey: true,
  imageFocusX: true,
  imageFocusY: true,
  imageCategory: { select: { imageKey: true } },
  calendarEvent: {
    select: {
      imageKey: true,
      imageFocusX: true,
      imageFocusY: true,
      imageFocusMobileX: true,
      imageFocusMobileY: true,
      imageZoomMobile: true,
      imageRatioMobile: true,
    },
  },
} as const;

export type TicketPosterSource = {
  imageKey: string | null;
  imageFocusX: number;
  imageFocusY: number;
  imageCategory: { imageKey: string | null } | null;
  calendarEvent: {
    imageKey: string | null;
    imageFocusX: number;
    imageFocusY: number;
    imageFocusMobileX?: number | null;
    imageFocusMobileY?: number | null;
    imageZoomMobile?: number | null;
    imageRatioMobile?: number | null;
  } | null;
};

/**
 * De storage-key en de uitsnede van de banner, of `null` zonder banner. De
 * foto van het kalenderevent brengt haar telefoonuitsnede mee (`mobile`); een
 * eigen foto of een themabanner heeft er geen.
 */
export function ticketPosterImage(
  event: TicketPosterSource,
): { key: string; focus: ImageFocus; mobile?: ImageCrop | null } | null {
  if (event.imageKey) {
    return { key: event.imageKey, focus: { x: event.imageFocusX, y: event.imageFocusY } };
  }
  // Een themabanner heeft geen eigen uitsnede: ze is gemaakt om in het midden
  // bijgesneden te worden, net als op /kalender.
  if (event.imageCategory?.imageKey) return { key: event.imageCategory.imageKey, focus: CENTER_FOCUS };
  if (event.calendarEvent?.imageKey) {
    return {
      key: event.calendarEvent.imageKey,
      focus: { x: event.calendarEvent.imageFocusX, y: event.calendarEvent.imageFocusY },
      mobile: mobileCropFrom(
        event.calendarEvent.imageFocusMobileX,
        event.calendarEvent.imageFocusMobileY,
        event.calendarEvent.imageZoomMobile,
        event.calendarEvent.imageRatioMobile,
      ),
    };
  }
  return null;
}

/** De banner zoals de publieke schermen hem tekenen. */
export function ticketPoster(
  event: TicketPosterSource,
): { src: string; position: string; focus: ImageFocus; mobile: ImageCrop | null } | null {
  const image = ticketPosterImage(event);
  const src = image ? publicUrl(image.key) : null;
  return image && src
    ? { src, position: focusPosition(image.focus), focus: image.focus, mobile: image.mobile ?? null }
    : null;
}

/** Enkel de URL, voor een plek die geen uitsnede kan meegeven (mail, nieuws). */
export function ticketPosterUrl(event: TicketPosterSource): string | null {
  const image = ticketPosterImage(event);
  return image ? publicUrl(image.key) : null;
}
