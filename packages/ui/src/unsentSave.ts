import { unstable_isUnrecognizedActionError } from "next/navigation";
import { FORBIDDEN_DIGEST, SIGNED_OUT_DIGEST } from "./actionErrors";

/**
 * Wat de proxy van vtk.be antwoordt op een schrijfactie tijdens een
 * voorvertoning als iemand anders. Dezelfde tekst als
 * `AUTHORIZATION_PREVIEW_READ_ONLY` in apps/web/lib/authorization-preview-constants.ts;
 * apps/web/test/unsentSave.test.ts houdt ze gelijk. Een app zonder
 * voorvertoning (de uitleendienst) krijgt hem nooit, en dan doet deze tak niets.
 */
const READ_ONLY_PREVIEW = "AUTHORIZATION_PREVIEW_READ_ONLY";

/**
 * Een opslag die de server nooit verwerkte, en waarom.
 *
 * - `stale`: de pagina komt van een vorige deploy en roept een server action op
 *   die er niet meer is ("Failed to find Server Action" in de logs). Wie een
 *   formulier openhoudt terwijl er gedeployd wordt, botst hierop.
 * - `offline`: het verzoek vertrok nooit (geen wifi, een laptop die net uit
 *   slaap komt). `fetch` faalt dan met een `TypeError`.
 * - `preview`: een superadmin bekijkt de site als iemand anders, en die
 *   voorvertoning is bewust alleen-lezen: de proxy houdt elke schrijfactie
 *   tegen (`proxy.ts`). Zonder deze herkenning werd een klik op opslaan in de
 *   voorvertoning het foutscherm.
 * - `signedOut`: de sessie verliep terwijl de pagina openstond. De action gooit
 *   dan een fout met `digest: "UNAUTHENTICATED"` (de uitleendienst doet dat in
 *   `requireSession`); Next geeft een eigen digest ook in productie door, waar
 *   het de tekst van de fout weglaat.
 * - `forbidden`: idem met `digest: "FORBIDDEN"`, voor wie zijn rechten verloor
 *   (de 15-juli-wissel) terwijl het beheer openstond.
 *
 * Geen van allen is een fout in de code, en in elk geval moet wat iemand
 * invulde blijven staan. Zonder deze herkenning gooide `SaveForm` de fout door
 * naar de error boundary, die het hele scherm verving: een halfuur typwerk weg.
 * Een fout die de server wél gooide, gaat nog altijd naar de error boundary en
 * de monitoring (zie CLAUDE.md, "Opslaan meldt altijd zijn uitkomst").
 */
export type UnsentReason = "stale" | "offline" | "preview" | "signedOut" | "forbidden";


function digestOf(error: unknown): string | null {
  if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string") {
    return error.digest;
  }
  return null;
}

export function unsentSaveReason(error: unknown): UnsentReason | null {
  if (unstable_isUnrecognizedActionError(error)) return "stale";
  if (error instanceof Error && error.message === READ_ONLY_PREVIEW) return "preview";
  const digest = digestOf(error);
  if (digest === SIGNED_OUT_DIGEST) return "signedOut";
  if (digest === FORBIDDEN_DIGEST) return "forbidden";
  // Chrome zegt "Failed to fetch", Firefox "NetworkError when attempting to
  // fetch resource", Safari "Load failed".
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return "offline";
  return null;
}

/** De foutcode die `SaveForm` teruggeeft; een eigen code per reden. */
export const UNSENT_SAVE_CODES: Record<UnsentReason, string> = {
  stale: "PAGE_OUTDATED",
  offline: "OFFLINE",
  preview: "AUTHORIZATION_PREVIEW_READ_ONLY",
  signedOut: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
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
  if (reason === "signedOut") {
    return english
      ? "Not saved: you are no longer signed in. What you entered is still here: sign in again in another tab, then try once more."
      : "Niet opgeslagen: je bent niet meer ingelogd. Wat je invulde staat er nog: log in een ander tabblad opnieuw in en probeer het dan nog eens.";
  }
  if (reason === "forbidden") {
    return english
      ? "Not saved: you no longer have the rights for this. What you entered is still here; ask whoever manages this to check your rights."
      : "Niet opgeslagen: je hebt hier niet (meer) de rechten voor. Wat je invulde staat er nog; vraag wie dit beheert om je rechten na te kijken.";
  }
  if (reason === "preview") {
    return english
      ? "Not saved: you are viewing the site as someone else, and that preview never saves anything. Stop the preview to do this for real."
      : "Niet opgeslagen: je bekijkt de site als iemand anders, en die voorvertoning slaat niets op. Stop de voorvertoning om dit echt te doen.";
  }
  return english
    ? "Not saved: no connection to the server. What you entered is still here; try again once you are back online."
    : "Niet opgeslagen: geen verbinding met de server. Wat je invulde staat er nog; probeer opnieuw zodra je weer online bent.";
}
