import {
  AFTERMOVIE_EVENT,
  ALBUM_VIEW_EVENT,
  CALENDAR_ADD_EVENT,
  CALENDAR_FEED_EVENT,
  CHECKOUT_START_EVENT,
  EVENT_VIEW_EVENT,
  FACE_SEARCH_EVENT,
  FORM_SUBMITTED_EVENT,
  PHOTO_DOWNLOAD_EVENT,
  PIANO_RESERVATION_EVENT,
  SEARCH_EMPTY_EVENT,
  SEARCH_QUERY_EVENT,
  SHIFT_SIGNUP_EVENT,
  TICKET_PURCHASED_EVENT,
  magazineEventName,
  magazineViewTitle,
  magazineViewUrl,
} from "@/lib/analytics";

/**
 * De browserkant van de statistieken: de paar plekken waar we Umami zelf iets
 * vertellen in plaats van te wachten op een gewone paginanavigatie.
 *
 * Alles hier is stil als er niets te meten valt. `window.umami` bestaat enkel
 * wanneer het script geladen is, en dat gebeurt alleen na een expliciete
 * toestemming voor statistieken (zie `lib/analytics.ts` en de cookiebanner).
 * Zonder toestemming, zonder configuratie of tijdens het serverrenderen doen
 * deze functies dus niets, en dat is precies de bedoeling: meten mag nooit een
 * voorwaarde zijn om de site te kunnen gebruiken.
 */

/**
 * Alleen wat we van Umami gebruiken. `track` neemt een functie die de standaard
 * eigenschappen (website-id, verwijzer, scherm) binnenkrijgt en aangepast
 * teruggeeft; zo overschrijven we het adres zonder de rest kwijt te spelen.
 */
type UmamiTracker = {
  track: {
    (props: (props: Record<string, unknown>) => Record<string, unknown>): void;
    (eventName: string, eventData?: Record<string, unknown>): void;
  };
};

function tracker(): UmamiTracker | null {
  if (typeof window === "undefined") return null;
  const umami = (window as unknown as { umami?: Partial<UmamiTracker> }).umami;
  return typeof umami?.track === "function" ? (umami as UmamiTracker) : null;
}

export type TrackedIssue = {
  id: string;
  kind: string;
  publicationTitle: string;
  issueLabel: string;
};

/** Een geopend nummer: zendt zowel een virtuele paginaweergave als een custom event (bakske-bekeken / irreel-bekeken). */
export function trackMagazineView(issue: TrackedIssue): void {
  const tr = tracker();
  if (!tr) return;
  // 1. Virtuele paginaweergave voor de admin-statistieken op de site
  tr.track((props) => ({
    ...props,
    url: magazineViewUrl(issue),
    title: magazineViewTitle(issue),
  }));
  // 2. Expliciet Umami Event met specifiek publicatietype (bakske-bekeken / irreel-bekeken)
  tr.track(magazineEventName(issue.kind, "bekeken"), {
    ...magazineEventData(issue),
    titel: magazineViewTitle(issue),
  });
}

/** Downloaden en openen in een nieuw tabblad: wel gemeten met specifiek event, geen paginaweergave. */
export function trackMagazineDownload(issue: TrackedIssue): void {
  tracker()?.track(magazineEventName(issue.kind, "download"), magazineEventData(issue));
}

export function trackMagazineNewTab(issue: TrackedIssue): void {
  tracker()?.track(magazineEventName(issue.kind, "nieuw-tabblad"), magazineEventData(issue));
}

/**
 * Wat er bij zo'n gebeurtenis meegaat. Bewust geen vrije tekst uit de pagina:
 * de soort en de id van het nummer, meer heeft een redactie niet nodig om haar
 * eigen cijfers te herkennen.
 */
function magazineEventData(issue: TrackedIssue): Record<string, string> {
  return { publicatie: issue.kind, nummer: issue.id };
}

/**
 * Een zoekopdracht zonder resultaat, met de term erbij. De term staat sowieso al
 * in het adres van de zoekpagina (Umami bewaart de querystring), dus dit voegt
 * geen gegevens toe die er nog niet waren; het maakt enkel zichtbaar welke
 * ervan op niets uitliepen.
 */
export function trackEmptySearch(query: string): void {
  const term = query.trim();
  if (!term) return;
  tracker()?.track(SEARCH_EMPTY_EVENT, { zoekterm: term });
}

/** Een aftermovie die begint te spelen. */
export function trackAftermovie(video: { id: string; title: string }): void {
  tracker()?.track(AFTERMOVIE_EVENT, { video: video.id, titel: video.title });
}

/**
 * Het begin van een ticketbestelling. Bewust zonder bestelnummer: dat hoort bij
 * een persoon, en de bestelpagina's worden juist daarom niet gemeten. Wat we
 * willen weten is hoeveel mensen die een evenement openen ook effectief
 * beginnen af te rekenen.
 */
export function trackCheckoutStart(event: { slug: string; title: string }): void {
  tracker()?.track(CHECKOUT_START_EVENT, { evenement: event.slug, titel: event.title });
}

/** Een geopend fotogalerij-album op /media. */
export function trackAlbumView(album: { id: string; title: string }): void {
  tracker()?.track(ALBUM_VIEW_EVENT, { album_id: album.id, titel: album.title });
}

/** Downloaden van een foto uit de galerij. */
export function trackPhotoDownload(photo: { id: string; albumId?: string }): void {
  tracker()?.track(PHOTO_DOWNLOAD_EVENT, { foto_id: photo.id, album_id: photo.albumId ?? "" });
}

/** Gebruik van de AI gezichtsherkenning in de fotogalerij. */
export function trackFaceSearch(matchCount: number): void {
  tracker()?.track(FACE_SEARCH_EVENT, { aantal_matches: String(matchCount) });
}

/** Bekijken van een ticket-evenement. */
export function trackEventView(event: { slug: string; title: string }): void {
  tracker()?.track(EVENT_VIEW_EVENT, { evenement: event.slug, titel: event.title });
}

/** Voltooide ticketbestelling (geen persoonsgegevens, enkel evenement en aantal). */
export function trackTicketPurchased(details: { eventSlug: string; ticketCount: number }): void {
  tracker()?.track(TICKET_PURCHASED_EVENT, {
    evenement: details.eventSlug,
    aantal_tickets: String(details.ticketCount),
  });
}

/** Toevoegen van een activiteit aan een persoonlijke agenda (iCal / Google Calendar). */
export function trackCalendarAdd(eventTitle: string): void {
  tracker()?.track(CALENDAR_ADD_EVENT, { titel: eventTitle });
}

/** Kopiëren van de persoonlijke iCal kalenderfeed. */
export function trackCalendarFeedCopy(): void {
  tracker()?.track(CALENDAR_FEED_EVENT);
}

/** Inschrijving voor een shift (bijv. tappen/kassa). */
export function trackShiftSignup(shiftDetails: { title: string }): void {
  tracker()?.track(SHIFT_SIGNUP_EVENT, { titel: shiftDetails.title });
}

/** Ingediend dynamisch formulier. */
export function trackFormSubmitted(form: { slug: string }): void {
  tracker()?.track(FORM_SUBMITTED_EVENT, { formulier: form.slug });
}

/** Reservatie gemaakt voor het pianolokaal. */
export function trackPianoReservation(): void {
  tracker()?.track(PIANO_RESERVATION_EVENT);
}

/** Zoekopdracht uitgevoerd in de zoekbalk. */
export function trackSearchQuery(query: string): void {
  const term = query.trim();
  if (!term) return;
  tracker()?.track(SEARCH_QUERY_EVENT, { zoekterm: term });
}
