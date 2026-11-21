/**
 * Fouten die een server action gooit en die de client herkent, ook in
 * productie.
 *
 * Next laat in productie de tekst van een fout uit een server action weg, maar
 * geeft een `digest` die er al op staat ongewijzigd door (zoals bij
 * `redirect()`). Het vangnet (`unsentGuard`, via `unsentSave.ts`) herkent deze
 * digests en maakt er een rode toast van met het formulier nog ingevuld, in
 * plaats van de foutpagina die alles wegveegt wat iemand typte.
 *
 * Een eigen module zonder imports, want de server gooit ze: `unsentSave.ts`
 * gebruikt een API van Next die enkel in clientcode mag.
 */

/** De sessie is verlopen terwijl de pagina openstond. */
export const SIGNED_OUT_DIGEST = 'UNAUTHENTICATED';

/** De rechten ontbreken (meestal: verloren bij de 15-juli-wissel). */
export const FORBIDDEN_DIGEST = 'FORBIDDEN';

export type RecognizableActionError = typeof SIGNED_OUT_DIGEST | typeof FORBIDDEN_DIGEST;

/** Een `Error` met de digest erop, om te gooien vanuit een action of een `require...`-helper. */
export function recognizableActionError(code: RecognizableActionError): Error {
  return Object.assign(new Error(code), { digest: code });
}
