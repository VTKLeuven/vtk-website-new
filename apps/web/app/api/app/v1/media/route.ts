import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { listImmichGalleryAlbums } from "@/lib/immich-gallery";
import { getMediaContent, type MediaPublication } from "@/lib/media-content";
import { publicUrl } from "@/lib/storage";
import { videoEmbed } from "@/lib/videoEmbed";
import { appLocaleFrom, type AppMedia } from "@/lib/app-api/contract";
import { absoluteUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Media: fotoalbums, aftermovies en de magazines.
 *
 * De albums komen uit Immich en nergens anders (zie `docs/design-decisions.md`);
 * `listImmichGalleryAlbums` leest de momentopname die de site zelf ook gebruikt.
 * Valt Immich weg, dan geeft die functie een lege lijst en toont de app een lege
 * sectie in plaats van een fout: de aftermovies en de magazines staan er los van
 * en hoeven niet mee onderuit te gaan.
 *
 * De foto-URL's van Immich lopen al over onze eigen proxyroutes, dus die krijgen
 * enkel de host er nog voor.
 */
export async function GET(request: Request) {
  try {
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const [gallery, media] = await Promise.all([
      listImmichGalleryAlbums().catch(() => ({ albums: [] })),
      getMediaContent(),
    ]);

    const payload: AppMedia = {
      albums: gallery.albums.map((album) => ({
        slug: album.slug,
        title: album.title,
        description: album.description || null,
        date: album.date,
        photoCount: album.photoCount,
        coverUrl: absoluteUrl(request, album.coverPhoto?.thumbnailUrl ?? null),
        coverPreviewUrl: absoluteUrl(request, album.coverPhoto?.previewUrl ?? null),
      })),

      aftermovies: media.videos
        .flatMap((video) => {
          const embed = videoEmbed(video.url, video.posterUrl);
          if (!embed) return [];
          return [
            {
              id: video.id,
              title: pick(video.titleNl, video.titleEn ?? video.titleNl, locale),
              externalUrl: embed.externalUrl,
              // `videoEmbed` geeft een pad op onze eigen proxy terug
              // (`/api/video-thumbnail`); de app heeft een volledig adres nodig.
              posterUrl: absoluteUrl(request, embed.posterUrl ?? null),
            },
          ];
        }),

      // Nieuwste eerst, zoals de plank op /media: de app zet het eerste nummer
      // van elk blad vooraan en de rest in de rij met eerdere nummers.
      publications: [...media.publications].sort(newestFirst).map((publication) => {
        const issue = pick(publication.issueNl, publication.issueEn ?? publication.issueNl, locale);
        return {
          id: publication.id,
          // De titel plus het nummer, want "Bakske" alleen zegt niet welk nummer
          // je openslaat. Een app van na november 2026 toont `issue` apart.
          title: [pick(publication.titleNl, publication.titleEn ?? publication.titleNl, locale), issue]
            .filter(Boolean)
            .join(" "),
          kind: publication.kind,
          // Bladzijde 1, bewaard bij het uploaden (zie lib/magazineCover.ts).
          coverUrl: absoluteUrl(request, publicUrl(publication.coverKey)),
          // Dezelfde route als de plank op /media, die de pdf uit de opslag of
          // van een oud adres haalt. Niet `publicUrl(storageKey)`: dat gaf
          // `/api/media/publications/<hash>.pdf`, en dat adres valt onder deze
          // route (één segment na `publications/`) en niet onder `[...key]`, dus
          // gaf elk nummer in de app een 404.
          url: absoluteUrl(request, `/api/media/publications/${encodeURIComponent(publication.id)}`),
          // Elke bladzijde als JPEG, voor de lezer in de app; `null` tot de
          // server ze gemaakt heeft (zie lib/magazineCover.ts).
          pages: publication.pageKeys?.length
            ? publication.pageKeys.flatMap((key) => absoluteUrl(request, publicUrl(key)) ?? [])
            : null,
          issue: issue || null,
          publishedAt: publication.publishedAt ?? null,
        };
      }),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/** Op `publishedAt`, nieuwste eerst; een nummer zonder datum achteraan. */
function newestFirst(left: MediaPublication, right: MediaPublication): number {
  const a = left.publishedAt ? Date.parse(left.publishedAt) : Number.NaN;
  const b = right.publishedAt ? Date.parse(right.publishedAt) : Number.NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) return b - a;
  if (Number.isFinite(a)) return -1;
  if (Number.isFinite(b)) return 1;
  return 0;
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
