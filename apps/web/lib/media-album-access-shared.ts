/**
 * Het deel van `media-album-access.ts` dat ook in de browser draait: de vorm van
 * de rechten en de regel voor een kladversie. Geen import van `@vtk/auth`, zodat
 * het album in het beheer niet de hele auth-laag meeneemt.
 */

export type AlbumRights = {
  /** Foto's toevoegen aan een bestaand album. */
  upload: boolean;
  /** Een album of tab aanmaken, en een verborgen album bewerken. */
  create: boolean;
  /** Alles: publiceren, verbergen, delen, downloaden, verwijderen. */
  manage: boolean;
};

/**
 * Mag je de titel, beschrijving, cover of tabs van dit album wijzigen? Een
 * beheerder altijd; wie albums aanmaakt enkel zolang het verborgen is.
 */
export function canEditAlbum(rights: AlbumRights, album: { hidden: boolean }): boolean {
  return rights.manage || (rights.create && album.hidden);
}
