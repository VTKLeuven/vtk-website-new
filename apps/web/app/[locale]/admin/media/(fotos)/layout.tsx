import { after } from "next/server";
import { fakbarUploadEnabled } from "@/lib/fakbar-gallery";
import { countTrash, loadLibraryAlbums, purgeExpiredGalleryTrash } from "@/lib/media-admin";
import { sharedAlbumIds } from "@/lib/media-share";
import { requireAnyPermission } from "@/lib/session";
import { currentWorkingYear } from "@/lib/workingYear";
import type { AdminAlbum } from "@/lib/immich-gallery";
import { MediaLibrary } from "./MediaLibrary";
import type { LibraryRow } from "./types";
import { ALBUM_UPLOAD_PERMISSIONS, albumRights } from "@/lib/media-album-access";

/**
 * Het tabblad Foto's: de albumlijst links blijft staan terwijl rechts een album,
 * de prullenmand of de lege toestand opent. Daarom een layout en geen pagina:
 * een layout tekent niet opnieuw bij het wisselen van album, dus wat je in het
 * zoekveld typte en hoe ver je gescrold was, blijft.
 */
export default async function PhotoLibraryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await requireAnyPermission([...ALBUM_UPLOAD_PERMISSIONS]);
  const rights = albumRights(session);

  let albums: AdminAlbum[] = [];
  let error = false;
  try {
    albums = await loadLibraryAlbums();
  } catch (cause) {
    console.error("Media library: albums could not be loaded", cause);
    error = true;
  }
  const [trashCount, fakbarEnabled, shared] = await Promise.all([
    rights.manage ? countTrash() : 0,
    // Naar de fakbar uploaden gaat enkel via een nieuw album.
    rights.create ? fakbarUploadEnabled() : false,
    sharedAlbumIds(),
  ]);

  // Wat langer dan 30 dagen in de prullenmand ligt, opruimen. Na het antwoord:
  // wie het beheer opent, wacht daar niet op. Het hangt niet af van wie kijkt,
  // dus ook een uploader zet het in gang; enkel de prullenmand zelf is afgeschermd.
  after(() => purgeExpiredGalleryTrash().catch((cause) => console.error("Gallery trash purge failed", cause)));

  const rows: LibraryRow[] = albums.map((album) => ({
    id: album.id,
    title: album.title,
    date: album.date,
    photoCount: album.photoCount,
    visibility: album.visibility,
    hidden: album.hidden,
    coverAssetId: album.coverAssetId,
    tabCount: album.parts.length > 1 ? album.parts.length : 0,
    workingYear: album.date ? currentWorkingYear(new Date(album.date)) : null,
    shared: shared.has(album.id),
  }));

  return (
    <MediaLibrary
      locale={locale}
      rows={rows}
      error={error}
      trashCount={trashCount}
      fakbarEnabled={fakbarEnabled}
      rights={rights}
    >
      {children}
    </MediaLibrary>
  );
}
