/**
 * Het groepsadres van een post, bv. `activiteiten@vtk.be`.
 *
 * Elke praesidiumpost heeft één vast adres in Google Workspace, en dat adres
 * volgt de postcode: `GROEP5` → `groep5@vtk.be`. Die conventie is niet nieuw;
 * de oude site (old.vtk.be/praesidium) toont voor alle vijftien posten exact
 * hetzelfde adres, en de postcodes zijn daar één op één op te leggen.
 *
 * Bewust géén blik op `MailGroup`/`MailGroupSource`: Groep 5 staat daar als bron
 * in élke postenlijst (zo zit g5 in elke lijst), dus uit die tabellen valt niet
 * eenduidig af te leiden welk adres *bij deze post* hoort. De postcode wél.
 */
export function postAddress(code: string): string {
  return `${code.trim().toLowerCase()}@vtk.be`;
}
