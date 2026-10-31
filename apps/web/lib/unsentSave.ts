import { unstable_isUnrecognizedActionError } from "next/navigation";

/**
 * Een opslag die de server nooit verwerkte, en waarom.
 *
 * - `stale`: de pagina komt van een vorige deploy en roept een server action op
 *   die er niet meer is ("Failed to find Server Action" in de logs). Wie een
 *   formulier openhoudt terwijl er gedeployd wordt, botst hierop.
 * - `offline`: het verzoek vertrok nooit (geen wifi, een laptop die net uit
 *   slaap komt). `fetch` faalt dan met een `TypeError`.
 *
 * Beide zijn geen fout van de server, en in beide gevallen moet wat iemand
 * invulde blijven staan. Zonder deze herkenning gooide `SaveForm` de fout door
 * naar de error boundary, die het hele scherm verving: een halfuur typwerk weg.
 * Een fout die de server wél gooide, gaat nog altijd naar de error boundary en
 * de monitoring (zie CLAUDE.md, "Opslaan meldt altijd zijn uitkomst").
 */
export type UnsentReason = "stale" | "offline";

export function unsentSaveReason(error: unknown): UnsentReason | null {
  if (unstable_isUnrecognizedActionError(error)) return "stale";
  // Chrome zegt "Failed to fetch", Firefox "NetworkError when attempting to
  // fetch resource", Safari "Load failed".
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return "offline";
  return null;
}

/** De foutcode die `SaveForm` teruggeeft; een eigen code per reden. */
export const UNSENT_SAVE_CODES: Record<UnsentReason, string> = {
  stale: "PAGE_OUTDATED",
  offline: "OFFLINE",
};

/**
 * Een volledige zin voor de rode toast. Twee talen hier en geen woordenboek:
 * `SaveForm` staat op bijna elke beheerpagina, en een `getDictionary` in zo'n
 * clientcomponent zet beide woordenboeken op elke pagina (docs/performance.md).
 */
export function unsentSaveMessage(reason: UnsentReason, english: boolean): string {
  if (reason === "stale") {
    return english
      ? "Not saved: the site was updated while this page was open. What you entered is still here: copy any text you want to keep, reload the page and paste it back."
      : "Niet opgeslagen: de site werd bijgewerkt terwijl deze pagina openstond. Wat je invulde staat er nog: kopieer de tekst die je wil houden, herlaad de pagina en plak hem terug.";
  }
  return english
    ? "Not saved: no connection to the server. What you entered is still here; try again once you are back online."
    : "Niet opgeslagen: geen verbinding met de server. Wat je invulde staat er nog; probeer opnieuw zodra je weer online bent.";
}
