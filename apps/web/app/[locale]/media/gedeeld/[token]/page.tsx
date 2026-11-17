import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SharedAlbumGate } from "@/components/media/SharedAlbumGate";
import { hasLocale } from "@/lib/locale";
import { checkShareAccess, findShareLink, loadSharedAlbum, recordShareOpen, type SharedPhoto } from "@/lib/media-share";
import { sharedAlbumCopy } from "@/lib/media-share-copy";
import { isLinkPreviewAgent } from "@/lib/media-share-shared";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { getCurrentSession } from "@/lib/session";
import { AlbumTabViewer } from "../../[albumSlug]/AlbumTabViewer";
import { AlbumViewer } from "../../[albumSlug]/AlbumViewer";
import { albumViewerLabels } from "../../viewerLabels";

/**
 * Een album achter een privélink: de albumpagina van /media, voor wie de link
 * heeft, ook wanneer het album niet op de site staat. Zie `lib/media-share.ts`
 * en docs/immich-gallery.md, "Een album delen met een link".
 *
 * Niet in de zoekmachines, niet in de sitemap en zonder albumtitel of cover in
 * de metadata: WhatsApp en Discord halen die op zodra iemand de link plakt, en
 * dan belandt een foto uit een verborgen album in hun cache. `next.config.ts`
 * zet er `no-referrer` en `private, no-store` op, zoals bij een ticketbestelling.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const nl = locale !== "en";
  const title = nl ? "Gedeeld album" : "Shared album";
  const description = nl ? "Een fotoalbum dat VTK met je deelde." : "A photo album VTK shared with you.";
  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
    openGraph: { title, description, images: [DEFAULT_OG_IMAGE] },
  };
}

function formatDay(value: Date | string | null, locale: Locale, withYear = true): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "Europe/Brussels",
  }).format(date);
}

export default async function SharedAlbumPage({ params }: { params: Params }) {
  const { locale: localeParam, token } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "nl" ? "" : "/en";

  const link = await findShareLink(token);
  if (!link) return <SharedAlbumGate kind="gone" locale={locale} />;

  const userId = link.audience === "LINK" ? null : ((await getCurrentSession())?.user.id ?? null);
  const access = await checkShareAccess(link, userId);
  if (!access.ok) {
    const back = `${base}/media/gedeeld/${token}`;
    return (
      <SharedAlbumGate
        kind={access.reason}
        locale={locale}
        loginHref={`${base}/inloggen?next=${encodeURIComponent(back)}`}
      />
    );
  }

  let album;
  try {
    album = await loadSharedAlbum(link.albumId, { fresh: true });
  } catch (error) {
    console.error("Shared album could not be loaded", link.albumId, error);
    return <SharedAlbumGate kind="unavailable" locale={locale} />;
  }
  // Een album in de prullenmand of definitief weg: voor de ontvanger hetzelfde
  // als een ingetrokken link.
  if (!album) return <SharedAlbumGate kind="gone" locale={locale} />;

  // Tellen na het antwoord, en enkel wat een mens is: een linkvoorbeeld van een
  // chatdienst haalt de pagina ook op.
  const userAgent = (await headers()).get("user-agent");
  if (!isLinkPreviewAgent(userAgent)) after(() => recordShareOpen(link.id));

  const dict = getDictionary(locale);
  const copy = sharedAlbumCopy(locale);
  const labels = albumViewerLabels(dict);
  const total = album.parts.reduce((sum, part) => sum + part.photos.length, 0);
  const date = formatDay(album.date, locale);
  const until = formatDay(link.expiresAt, locale) ?? "";

  const assetUrl = (assetId: string, size: "thumbnail" | "preview" | "original") =>
    `/api/immich-gallery/gedeeld/${token}/assets/${encodeURIComponent(assetId)}/${size}`;
  const toViewerPhoto = (photo: SharedPhoto) => ({
    id: photo.id,
    title: photo.title,
    width: photo.width,
    height: photo.height,
    thumbnailUrl: assetUrl(photo.id, "thumbnail"),
    previewUrl: assetUrl(photo.id, "preview"),
    downloadUrl: assetUrl(photo.id, "original"),
  });

  return (
    <div className="vtk-page">
      <header className="vtk-album-hero">
        <div className="vtk-album-hero-inner">
          <div>
            <div className="vtk-album-hero-kicker">
              <span className="vtk-dot" />
              {copy.kicker}
            </div>
            <h1>{album.title}</h1>
            {album.description ? <p>{album.description}</p> : null}
          </div>
          <div className="vtk-album-hero-meta">
            <b>{total}</b>
            <span>{total === 1 ? dict.photos.photo : dict.photos.photos}</span>
            {date ? <time dateTime={album.date ?? undefined}>{date}</time> : null}
          </div>
        </div>
      </header>

      <div className="vtk-page-shell vtk-immich-detail-shell">
        <div className="vtk-shared-notice">
          <p>
            <b>{copy.noticeTitle}</b> {copy.notice(link.audience, until)}
          </p>
          {link.allowDownload && total > 0 ? (
            // Een gewone link: de browser schrijft de zip zelf weg, zonder hem in
            // het geheugen te laden. Zie de route.
            <a className="btn btn-primary" href={`/api/immich-gallery/gedeeld/${token}/download`} download>
              {copy.downloadAll}
            </a>
          ) : null}
        </div>

        {total === 0 ? (
          <div className="vtk-card vtk-immich-state">
            <h2>{dict.photos.emptyAlbum}</h2>
          </div>
        ) : album.parts.length > 1 ? (
          <AlbumTabViewer
            allowDownload={link.allowDownload}
            subAlbums={album.parts.map((part) => ({
              id: part.id,
              slug: part.slug,
              title: part.name,
              photoCount: part.photos.length,
              photos: part.photos.map(toViewerPhoto),
            }))}
            labels={labels}
          />
        ) : (
          <AlbumViewer
            allowDownload={link.allowDownload}
            photos={album.parts[0].photos.map(toViewerPhoto)}
            labels={labels}
          />
        )}
      </div>
    </div>
  );
}
