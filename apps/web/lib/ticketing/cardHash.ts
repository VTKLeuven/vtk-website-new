/**
 * Het formaat waarin een studentenkaart in het offline-manifest terechtkomt.
 *
 * Bewust geen `server-only`: dit draait aan beide kanten. De server bouwt de
 * tabel bij het downloaden van het manifest, de scanner zoekt er offline in, en
 * de twee moeten letterlijk dezelfde string hashen.
 *
 * **Waarom een hash en niet het kaartnummer zelf.** Het manifest staat in de
 * localStorage van de telefoon van een lid. Een lijst met de echte
 * `serial;cardAppId` van achthonderd mensen is een lijst met precies de
 * identificatoren die elke lezer op de campus gebruikt; een hash beantwoordt
 * enkel de vraag die aan de deur telt, namelijk "zit deze kaart in de lijst".
 *
 * **Waarom een salt per manifest.** Zonder salt is `sha256(kaartnummer)` een
 * wereldwijd vaste waarde, en zijn twee manifesten van twee events zo aan elkaar
 * te leggen. Met een salt per download is de tabel enkel binnen dat ene manifest
 * bruikbaar.
 *
 * Wees eerlijk over wat dit niet is: de salt staat in datzelfde bestand. Dit is
 * pseudonimisering, geen geheimhouding. Wie het toestel in handen heeft en een
 * kaart heeft, kan nog altijd testen of die kaart in de lijst zit; wat hij niet
 * meer heeft, is de lijst kaartnummers zelf.
 */

/** De string die aan beide kanten gehasht wordt. */
export function cardHashInput(salt: string, card: string): string {
  return `${salt}:${card.replace(/[\r\n]+/g, "").trim().toLowerCase()}`;
}

/**
 * Hoeveel hex-tekens van de sha256 in het manifest gaan. 128 bit is ruim genoeg
 * tegen een botsing binnen één event en halveert de omvang van de tabel, wat op
 * een tragere verbinding aan de deur scheelt.
 */
export const CARD_HASH_LENGTH = 32;

/** Dezelfde hash, in de browser: `node:crypto` bestaat daar niet. */
export async function cardHashInBrowser(salt: string, card: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  // Ontbreekt enkel buiten een beveiligde context; de scanner draait als PWA over
  // https, dus dit is de vangrail en niet het normale pad.
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(cardHashInput(salt, card));
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, CARD_HASH_LENGTH);
}
