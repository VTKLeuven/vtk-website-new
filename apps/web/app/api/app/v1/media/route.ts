import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { listImmichGalleryAlbums } from "@/lib/immich-gallery";
import { getMediaContent } from "@/lib/media-content";
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
              posterUrl: embed.posterUrl ?? null,
            },
          ];
        }),

      publications: media.publications.map((publication) => ({
        id: publication.id,
        // De titel plus het nummer, want "Bakske" alleen zegt niet welk nummer je
        // openslaat en dat is precies wat iemand in een lijst zoekt.
        title: [
          pick(publication.titleNl, publication.titleEn ?? publication.titleNl, locale),
          pick(publication.issueNl, publication.issueEn ?? publication.issueNl, locale),
        ]
          .filter(Boolean)
          .join(" "),
        kind: publication.kind,
        coverUrl: null,
        // Een magazine staat ofwel bij ons in de opslag, ofwel op een extern
        // adres; `absoluteUrl` handelt allebei af.
        url: absoluteUrl(
          request,
          publication.storageKey ? publicUrl(publication.storageKey) : (publication.pdfUrl ?? null),
        ),
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
