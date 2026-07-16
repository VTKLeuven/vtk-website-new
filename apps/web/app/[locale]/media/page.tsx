import { notFound } from 'next/navigation';
import { getDictionary, pick, type Locale } from '@vtk/i18n';
import { hasLocale } from '@/lib/locale';
import { listImmichGalleryAlbums } from '@/lib/immich-gallery';
import { getMediaContent } from '@/lib/media-content';
import { AlbumGrid } from './AlbumGrid';
import { AftermoviePlayer } from './AftermoviePlayer';
import { MagazineShelf } from './MagazineShelf';

import '@/app/design/vtk-media.css';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export default async function MediaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === 'nl' ? '' : '/en';

  const [galleryResult, contentResult] = await Promise.allSettled([
    listImmichGalleryAlbums(),
    getMediaContent(),
  ]);

  const albums = galleryResult.status === 'fulfilled' ? galleryResult.value.albums : [];
  const videos = contentResult.status === 'fulfilled' ? contentResult.value.videos : [];
  const publications = contentResult.status === 'fulfilled' ? contentResult.value.publications : [];
  const galleryFailed = galleryResult.status === 'rejected';

  const sectionLinks = [
    { href: '#photos', label: dict.media.photosTitle, count: albums.length },
    { href: '#aftermovies', label: dict.media.aftermoviesTitle, count: videos.length },
    { href: '#magazines', label: dict.media.magazinesTitle, count: publications.length },
  ];

  return (
    <div className="vtk-page vtk-media-page">
      <header className="vtk-page-head vtk-media-hero">
        <div>
          <div className="vtk-page-kicker">VTK · Media</div>
          <h1 className="vtk-page-title">{dict.media.title}</h1>
          <p className="vtk-page-subtitle">{dict.media.lead}</p>
        </div>
        <div className="page-head-meta">
          <b>03</b>
          <br />
          {dict.media.sections}
        </div>
      </header>

      <nav className="vtk-media-index" aria-label={dict.media.sectionNav}>
        {sectionLinks.map((section, index) => (
          <a key={section.href} href={section.href}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{section.label}</strong>
            <small>{section.count}</small>
          </a>
        ))}
      </nav>

      <main>
        <section id="photos" className="vtk-media-section vtk-media-photos-section">
          <div className="vtk-media-section-inner">
            <header className="vtk-media-section-head">
              <div className="vtk-media-section-number" aria-hidden="true">
                01
              </div>
              <div>
                <h2>{dict.media.photosTitle}</h2>
                <p>{dict.media.photosLead}</p>
              </div>
              <div className="vtk-media-section-count">
                <b>{albums.length}</b>
                <span>{albums.length === 1 ? dict.photos.album : dict.photos.albums}</span>
              </div>
            </header>

            {galleryFailed ? (
              <div className="vtk-media-state" role="status">
                <h3>{dict.photos.loadError}</h3>
                <p>{dict.media.photosError}</p>
              </div>
            ) : albums.length === 0 ? (
              <div className="vtk-media-state" role="status">
                <h3>{dict.photos.empty}</h3>
                <p>{dict.media.photosEmpty}</p>
              </div>
            ) : (
              <AlbumGrid
                albums={albums.map((album) => ({
                  id: album.id,
                  href: `${base}/media/${album.slug}`,
                  title: album.title,
                  photoCount: album.photoCount,
                  dateLabel: formatDate(album.date, locale),
                  description: album.description,
                  thumbnailUrl: album.coverPhoto?.thumbnailUrl ?? null,
                }))}
                labels={{
                  album: dict.photos.album,
                  photo: dict.photos.photo,
                  photos: dict.photos.photos,
                  showMore: dict.media.showMoreAlbums,
                  showLess: dict.media.showFewerAlbums,
                }}
              />
            )}
          </div>
        </section>

        <section id="aftermovies" className="vtk-media-section vtk-media-video-section">
          <div className="vtk-media-section-inner">
            <header className="vtk-media-section-head">
              <div className="vtk-media-section-number" aria-hidden="true">
                02
              </div>
              <div>
                <h2>{dict.media.aftermoviesTitle}</h2>
                <p>{dict.media.aftermoviesLead}</p>
              </div>
              <div className="vtk-media-section-count">
                <b>{videos.length}</b>
                <span>{videos.length === 1 ? dict.media.video : dict.media.videos}</span>
              </div>
            </header>

            <AftermoviePlayer
              items={videos.map((video) => ({
                id: video.id,
                title: pick(video.titleNl, video.titleEn, locale),
                url: video.url,
                posterUrl: video.posterUrl,
                publishedLabel: formatDate(video.publishedAt, locale),
              }))}
              labels={{
                play: dict.media.playVideo,
                unavailable: dict.media.videoUnavailable,
                openExternal: dict.media.openVideoExternal,
              }}
            />
          </div>
        </section>

        <section id="magazines" className="vtk-media-section vtk-media-magazine-section">
          <div className="vtk-media-section-inner">
            <header className="vtk-media-section-head">
              <div className="vtk-media-section-number" aria-hidden="true">
                03
              </div>
              <div>
                <h2>{dict.media.magazinesTitle}</h2>
                <p>{dict.media.magazinesLead}</p>
              </div>
              <div className="vtk-media-section-count">
                <b>{publications.length}</b>
                <span>
                  {publications.length === 1 ? dict.media.publication : dict.media.publications}
                </span>
              </div>
            </header>

            {publications.length === 0 ? (
              <div className="vtk-media-state" role="status">
                <p>{dict.media.magazinesEmpty}</p>
              </div>
            ) : (
              <MagazineShelf
                issues={publications.map((publication) => ({
                  id: publication.id,
                  kind: publication.kind,
                  publicationTitle: pick(publication.titleNl, publication.titleEn, locale),
                  cadence:
                    publication.kind === 'bakske' ? dict.media.weekly : dict.media.semesterly,
                  issueLabel: pick(publication.issueNl, publication.issueEn, locale),
                  publishedAt: publication.publishedAt ?? null,
                  dateLabel: formatDate(publication.publishedAt, locale),
                  documentUrl: `/api/media/publications/${encodeURIComponent(publication.id)}`,
                }))}
                labels={{
                  open: dict.media.openPublication,
                  close: dict.media.closePublication,
                  loadingPreview: dict.media.loadingPreview,
                  previewError: dict.media.previewError,
                  viewerTitle: dict.media.documentViewer,
                  openNewTab: dict.media.openNewTab,
                  download: dict.media.downloadPdf,
                  viewerFallback: dict.media.loadingDocument,
                  viewerError: dict.media.documentError,
                  previousPage: dict.media.previousPage,
                  nextPage: dict.media.nextPage,
                  pageCounter: dict.media.pageCounter,
                  archiveTitle: dict.media.previousIssues,
                  showArchive: dict.media.showPreviousIssues,
                  hideArchive: dict.media.hidePreviousIssues,
                }}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
