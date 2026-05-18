import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { AlbumViewer } from "./AlbumViewer";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ locale: string; albumSlug: string }>;
}) {
  const { locale: localeParam, albumSlug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);

  const album = await prisma.photoAlbum.findUnique({
    where: { slug: albumSlug },
    include: { photos: { orderBy: { order: "asc" } } },
  });
  if (!album || !album.publishedAt) notFound();

  const photos = album.photos.map((p) => ({
    id: p.id,
    thumb: publicUrl(p.thumbnailKey || p.storageKey) ?? "",
    full: publicUrl(p.storageKey) ?? "",
  }));

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · {dict.photos.title}</div>
          <h1 className="vtk-page-title">{pick(album.titleNl, album.titleEn, locale)}</h1>
          {(album.descriptionNl || album.descriptionEn) && (
            <p className="vtk-page-subtitle">
              {pick(album.descriptionNl ?? "", album.descriptionEn ?? "", locale)}
            </p>
          )}
        </div>
        <div className="page-head-meta">
          <b>{photos.length}</b>
          <br />
          {locale === "nl" ? "foto's" : "photos"}
        </div>
      </header>
      <div className="vtk-page-shell">
        <AlbumViewer
          albumSlug={album.slug}
          photos={photos}
          labels={{
            downloadSelected: dict.photos.downloadSelected,
            downloadAll: dict.photos.downloadAll,
            selected: dict.photos.selected,
          }}
        />
      </div>
    </div>
  );
}
