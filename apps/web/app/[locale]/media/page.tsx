import Link from "next/link";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { listImmichGalleryAlbums } from "@/lib/immich-gallery";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function formatAlbumDate(value: string | null, locale: Locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function MediaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  let result: Awaited<ReturnType<typeof listImmichGalleryAlbums>> | null = null;
  let error: string | null = null;

  try {
    result = await listImmichGalleryAlbums();
  } catch (err) {
    error = err instanceof Error ? err.message : dict.photos.loadError;
  }

  const albums = result?.albums || [];

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · Media</div>
          <h1 className="vtk-page-title">{dict.photos.title}</h1>
          <p className="vtk-page-subtitle">{dict.photos.lead}</p>
        </div>
        <div className="page-head-meta">
          <b>{albums.length}</b>
          <br />
          {albums.length === 1 ? dict.photos.album : dict.photos.albums}
        </div>
      </header>

      <div className="vtk-page-shell">
        {error ? (
          <div className="vtk-card vtk-immich-state">
            <h2>{dict.photos.loadError}</h2>
            <p>{error}</p>
          </div>
        ) : albums.length === 0 ? (
          <div className="vtk-card vtk-immich-state">
            <h2>{dict.photos.empty}</h2>
            <p>{dict.photos.emptyHint}</p>
          </div>
        ) : (
          <ul className="vtk-immich-album-grid">
            {albums.map((album) => {
              const date = formatAlbumDate(album.date, locale);

              return (
                <li key={album.id}>
                  <Link href={`${base}/media/${album.slug}`} className="vtk-immich-album-card">
                    <span className="vtk-immich-album-cover">
                      {album.coverPhoto ? (
                        <img src={album.coverPhoto.thumbnailUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="ph-label">{dict.photos.album}</span>
                      )}
                    </span>
                    <span className="vtk-immich-album-body">
                      <span className="vtk-immich-album-title">{album.title}</span>
                      <span className="vtk-immich-album-meta">
                        {album.photoCount} {album.photoCount === 1 ? dict.photos.photo : dict.photos.photos}
                        {date ? ` · ${date}` : ""}
                      </span>
                      {album.description ? (
                        <span className="vtk-immich-album-description">{album.description}</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
