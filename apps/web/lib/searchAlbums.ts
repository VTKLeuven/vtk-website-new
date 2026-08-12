import type { Locale } from "@vtk/i18n";
import { scoreTextMatch, type SearchResult } from "@/lib/search";
import { localizedPath } from "@/lib/seo";

/**
 * Fotoalbums doorzoekbaar maken.
 *
 * Ze staan niet in de database: `/media` haalt ze bij elke render uit Immich, en
 * het `PhotoAlbum`-model in het schema wordt door geen enkele pagina gebruikt.
 * Er valt hier dus niets te indexeren; het matchen gebeurt in het geheugen over
 * de snapshot, net zoals bij de bestemmingen in `searchDestinations.ts`.
 *
 * Dat is meteen ook het juiste gedrag qua zichtbaarheid: een album zonder de
 * `[gallery]`-markering in Immich komt niet in die snapshot, en wat er wel in
 * zit staat sowieso publiek op /media.
 */

/**
 * Wat we van een album nodig hebben. Bewust structureel getypeerd en niet via
 * `GalleryAlbumSummary`: die module is `server-only`, en dan valt dit bestand
 * niet meer los te testen.
 */
export type SearchableAlbum = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  date: string | null;
  year: number | null;
  photoCount: number;
};

/** De albums die bij de zoekterm passen, als gewone zoekresultaten. */
export function matchAlbums(
  albums: SearchableAlbum[],
  query: string,
  locale: Locale,
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const album of albums) {
    const rank = scoreTextMatch(album.title, album.description, query);
    if (rank === 0) continue;

    results.push({
      kind: "album",
      // De id van Immich en niet de slug: die laatste wordt bij elke snapshot
      // opnieuw uit de albumnaam afgeleid en kan dus schuiven. Voor het adres
      // gebruiken we ze wel, want dat is het adres van dit moment.
      id: album.id,
      href: localizedPath(`/media/${album.slug}`, locale),
      title: album.title,
      meta: albumMeta(album, locale),
      rank,
      snippet: album.description ? [{ text: album.description, highlight: false }] : [],
    });
  }

  return results;
}

/** Eén regel context: wanneer het album gemaakt is en hoeveel foto's erin zitten. */
function albumMeta(album: SearchableAlbum, locale: Locale): string | null {
  const nl = locale === "nl";
  const photos = `${album.photoCount} ${album.photoCount === 1 ? (nl ? "foto" : "photo") : (nl ? "foto's" : "photos")}`;
  const when = formatAlbumDate(album.date, nl) ?? (album.year ? String(album.year) : null);
  return when ? `${when} · ${photos}` : photos;
}

/** De datum uit Immich is een string; een onleesbare waarde geeft niets terug. */
function formatAlbumDate(value: string | null, nl: boolean): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
