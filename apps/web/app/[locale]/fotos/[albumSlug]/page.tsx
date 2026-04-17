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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold">{pick(album.titleNl, album.titleEn, locale)}</h1>
      {(album.descriptionNl || album.descriptionEn) && (
        <p className="mt-2 text-zinc-600">
          {pick(album.descriptionNl ?? "", album.descriptionEn ?? "", locale)}
        </p>
      )}
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
  );
}
