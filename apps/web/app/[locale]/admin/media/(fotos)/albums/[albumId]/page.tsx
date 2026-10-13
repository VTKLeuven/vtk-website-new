import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { loadLibraryAlbum } from "@/lib/media-admin";
import { requireAnyPermission } from "@/lib/session";
import { AlbumManager } from "./AlbumManager";

/**
 * Eén album, rechts naast de lijst. Het adres draagt het Immich-id van het
 * hoofdalbum: dat blijft hetzelfde wanneer je de titel wijzigt, en een
 * verborgen album heeft geen slug op de site.
 */
export const dynamic = "force-dynamic";

export default async function PhotoAlbumPage({
  params,
}: {
  params: Promise<{ locale: string; albumId: string }>;
}) {
  const { locale, albumId: raw } = await params;
  if (!hasLocale(locale)) notFound();
  await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  const albumId = decodeURIComponent(raw);

  const loaded = await loadLibraryAlbum(albumId).catch((cause) => {
    console.error("Media library: album could not be loaded", cause);
    return "error" as const;
  });
  if (loaded === "error") {
    return (
      <div className="ticket-admin-empty-state">
        <p className="ticket-admin-empty-title">
          {locale === "nl" ? "Dit album kon niet geladen worden" : "This album could not be loaded"}
        </p>
        <p className="ticket-admin-empty-copy">
          {locale === "nl"
            ? "De fotobibliotheek is niet bereikbaar. Probeer straks opnieuw."
            : "The photo library is unreachable. Try again later."}
        </p>
      </div>
    );
  }
  if (!loaded) {
    // Net naar de prullenmand gegaan: de actie tekent deze pagina nog eens, en
    // dan hoort er geen 404 te verschijnen maar het overzicht.
    const trashed = await prisma.galleryTrashedAlbum.findFirst({
      where: { OR: [{ albumId }, { partIds: { has: albumId } }] },
      select: { id: true },
    });
    if (trashed) redirect(`${locale === "nl" ? "" : "/en"}/admin/media`);
    notFound();
  }

  // Een oude link met de slug van de site, of een link naar een tab: naar het
  // adres van het album zelf, zodat de lijst links het juiste album aanduidt.
  if (loaded.album.id !== albumId) {
    redirect(`${locale === "nl" ? "" : "/en"}/admin/media/albums/${encodeURIComponent(loaded.album.id)}`);
  }

  const { album, parts, publicPath } = loaded;
  return (
    <AlbumManager
      // Een ander album is een nieuw scherm: selectie, tab en filter beginnen opnieuw.
      key={album.id}
      locale={locale}
      album={{
        id: album.id,
        title: album.title,
        description: album.description,
        date: album.date,
        hidden: album.hidden,
        coverAssetId: album.coverAssetId,
        hasOwnTabName: album.hasOwnTabName,
      }}
      parts={parts}
      publicPath={publicPath ? `${locale === "nl" ? "" : "/en"}${publicPath}` : null}
    />
  );
}
