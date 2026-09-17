/**
 * De link naar de materiaallijst van een aanvraag, zoals hij in de lading van
 * een rit belandt.
 *
 * Waarom in de lading en niet als een eigen veld op de rit: er staat al een
 * `reservationId` op de boeking, maar dat is een koppeling in de database en
 * niet iets wat iemand leest. Wie de rit openslaat, wil één regel die zegt wat
 * er mee moet en waar de lijst staat. `lib/linkify.ts` maakt het adres
 * aanklikbaar, waar de rit ook getoond wordt.
 *
 * Een pad en geen volledig adres: het werkt dan op logistiek.vtk.be zo goed als
 * op een testomgeving, en de weergavekant opent een intern pad gewoon in
 * hetzelfde venster.
 */
export function materialListHref(reservationId: string): string {
  return `/beheer/aanvragen/${reservationId}`;
}

/** Diezelfde link met het woord ervoor, klaar om in een ladingveld te plakken. */
export function materialListNote(reservationId: string): string {
  return `Materiaallijst: ${materialListHref(reservationId)}`;
}
