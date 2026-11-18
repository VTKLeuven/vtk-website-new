import type { Permission } from "@vtk/auth";
import { hasPermission } from "@vtk/auth";
import type { AlbumRights } from "@/lib/media-album-access-shared";

export { canEditAlbum, type AlbumRights } from "@/lib/media-album-access-shared";

/**
 * Wie wat mag met de fotoalbums in /admin/media.
 *
 * Drie trappen, elk met alles van de vorige erbij:
 *
 * - **uploaden** (`photos.upload`): het tabblad Foto's openen en foto's toevoegen
 *   aan een album dat er al is. Geen album aanmaken, niets publiceren, niets
 *   verwijderen, en ook niet hernoemen, de cover zetten of foto's verbergen.
 * - **aanmaken** (`photos.createAlbums`): daarbovenop een nieuw album maken (dat
 *   altijd verborgen begint) en een tab toevoegen. Zolang een album verborgen
 *   is, is het een kladversie: dan mag deze trap ook de titel, de beschrijving,
 *   de cover en de tabs ervan bewerken. Eens het op de site staat (openbaar of
 *   privé), niet meer.
 * - **beheren** (`photos.manageAlbums`, en `media.manage` van Communicatie):
 *   alles, ook de stand kiezen (openbaar, privé, verborgen), foto's verbergen,
 *   privélinks, downloaden en de prullenmand.
 *
 * Zie `docs/design-decisions.md`, "Rechten op de fotoalbums".
 */

export const ALBUM_MANAGE_PERMISSIONS = ["media.manage", "photos.manageAlbums"] as const satisfies readonly Permission[];
export const ALBUM_CREATE_PERMISSIONS = [
  ...ALBUM_MANAGE_PERMISSIONS,
  "photos.createAlbums",
] as const satisfies readonly Permission[];
/** Wie het tabblad Foto's mag openen: elke trap. */
export const ALBUM_UPLOAD_PERMISSIONS = [
  ...ALBUM_CREATE_PERMISSIONS,
  "photos.upload",
] as const satisfies readonly Permission[];

type SessionLike = Parameters<typeof hasPermission>[0];

export function albumRights(session: SessionLike): AlbumRights {
  const has = (codes: readonly Permission[]) => codes.some((code) => hasPermission(session, code));
  return {
    upload: has(ALBUM_UPLOAD_PERMISSIONS),
    create: has(ALBUM_CREATE_PERMISSIONS),
    manage: has(ALBUM_MANAGE_PERMISSIONS),
  };
}
