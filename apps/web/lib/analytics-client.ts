import {
  MAGAZINE_DOWNLOAD_EVENT,
  MAGAZINE_NEW_TAB_EVENT,
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
    (payload: (props: Record<string, unknown>) => Record<string, unknown>): void;
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

/** Een geopend nummer, als eigen paginaweergave. */
export function trackMagazineView(issue: TrackedIssue): void {
  tracker()?.track((props) => ({
    ...props,
    url: magazineViewUrl(issue),
    title: magazineViewTitle(issue),
  }));
}

/** Downloaden en openen in een nieuw tabblad: wel gemeten, geen paginaweergave. */
export function trackMagazineDownload(issue: TrackedIssue): void {
  tracker()?.track(MAGAZINE_DOWNLOAD_EVENT, magazineEventData(issue));
}

export function trackMagazineNewTab(issue: TrackedIssue): void {
  tracker()?.track(MAGAZINE_NEW_TAB_EVENT, magazineEventData(issue));
}

/**
 * Wat er bij zo'n gebeurtenis meegaat. Bewust geen vrije tekst uit de pagina:
 * de soort en de id van het nummer, meer heeft een redactie niet nodig om haar
 * eigen cijfers te herkennen.
 */
function magazineEventData(issue: TrackedIssue): Record<string, string> {
  return { publicatie: issue.kind, nummer: issue.id };
}
