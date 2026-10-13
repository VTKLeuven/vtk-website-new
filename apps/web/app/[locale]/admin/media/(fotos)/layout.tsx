import { after } from "next/server";
import { fakbarUploadEnabled } from "@/lib/fakbar-gallery";
import { countTrash, loadLibraryAlbums, purgeExpiredGalleryTrash } from "@/lib/media-admin";
import { requireAnyPermission } from "@/lib/session";
import { currentWorkingYear } from "@/lib/workingYear";
import type { AdminAlbum } from "@/lib/immich-gallery";
import { MediaLibrary } from "./MediaLibrary";
import type { LibraryRow } from "./types";

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
  await requireAnyPermission(["media.manage", "photos.manageAlbums"]);

  let albums: AdminAlbum[] = [];
  let error = false;
  try {
    albums = await loadLibraryAlbums();
  } catch (cause) {
    console.error("Media library: albums could not be loaded", cause);
    error = true;
  }
  const [trashCount, fakbarEnabled] = await Promise.all([countTrash(), fakbarUploadEnabled()]);

  // Wat langer dan 30 dagen in de prullenmand ligt, opruimen. Na het antwoord:
  // wie het beheer opent, wacht daar niet op.
  after(() => purgeExpiredGalleryTrash().catch((cause) => console.error("Gallery trash purge failed", cause)));

  const rows: LibraryRow[] = albums.map((album) => ({
    id: album.id,
    title: album.title,
    date: album.date,
    photoCount: album.photoCount,
    hidden: album.hidden,
    coverAssetId: album.coverAssetId,
    tabCount: album.parts.length > 1 ? album.parts.length : 0,
    workingYear: album.date ? currentWorkingYear(new Date(album.date)) : null,
  }));

  return (
    <MediaLibrary locale={locale} rows={rows} error={error} trashCount={trashCount} fakbarEnabled={fakbarEnabled}>
      {children}
    </MediaLibrary>
  );
}
