import { createSlugAllocator, dateValue, slugify, type ParsedAlbumMarkers } from './format';
import type { GalleryAlbum, GallerySubAlbum } from './types';

export type MappedAlbumEntry = {
  album: GalleryAlbum;
  markers: ParsedAlbumMarkers;
  rawTitle: string;
  rawDescription: string;
};

/**
 * Bepaalt de weergavetitel van een tab.
 */
function resolveTabTitle(
  entry: MappedAlbumEntry,
  isParent: boolean,
  hasOtherTabs: boolean,
): string {
  if (entry.markers.tab) {
    return entry.markers.tab;
  }
  if (entry.markers.titleSuffix) {
    return entry.markers.titleSuffix;
  }
  if (isParent && hasOtherTabs) {
    return 'Algemeen';
  }
  return entry.album.title;
}

/**
 * Groepeert losse Immich-albums tot overkoepelende evenement-albums met sub-albums/tabs.
 *
 * Ondersteunt:
 * 1. [parent: galabal-2026] in de beschrijving van een deelalbum.
 * 2. [group: galabal-2026] in de beschrijving van meerdere albums.
 *
 * Groeperen gebeurt uitsluitend via expliciete merkers, niet automatisch op
 * basis van titelpatronen (zoals "Sport van de maand: ..."), zodat verschillende
 * evenementen in dezelfde reeks netjes aparte albums blijven.
 */
export function groupAlbums(
  entries: MappedAlbumEntry[],
  downloadPath?: (slug: string, assetId: string) => string,
): GalleryAlbum[] {
  if (entries.length === 0) return [];

  // Wijs elk album toe aan een groepssleutel op basis van expliciete merkers
  const entryGroupKey = new Map<MappedAlbumEntry, string>();
  for (const entry of entries) {
    if (entry.markers.parent) {
      entryGroupKey.set(entry, slugify(entry.markers.parent));
    } else if (entry.markers.group) {
      entryGroupKey.set(entry, slugify(entry.markers.group));
    }
  }

  // Groepeer op sleutel
  const groups = new Map<string, MappedAlbumEntry[]>();
  const standalone: MappedAlbumEntry[] = [];

  for (const entry of entries) {
    const key = entryGroupKey.get(entry);
    if (!key) {
      // Controleer of dit album toevallig de parent is van een andere groep
      const titleKey = slugify(entry.album.title);
      const slugKey = entry.album.slug;
      let targetKey: string | null = null;

      for (const other of entries) {
        const otherKey = entryGroupKey.get(other);
        if (otherKey && (otherKey === titleKey || otherKey === slugKey) && other !== entry) {
          targetKey = otherKey;
          break;
        }
      }

      if (targetKey) {
        entryGroupKey.set(entry, targetKey);
        const list = groups.get(targetKey) || [];
        list.push(entry);
        groups.set(targetKey, list);
      } else {
        standalone.push(entry);
      }
    } else {
      const list = groups.get(key) || [];
      list.push(entry);
      groups.set(key, list);
    }
  }

  const result: GalleryAlbum[] = [];

  // Voeg standalone albums toe
  for (const entry of standalone) {
    result.push(entry.album);
  }

  // Verwerk gegroepeerde albums
  for (const [groupKey, groupEntries] of groups.entries()) {
    if (groupEntries.length <= 1) {
      result.push(groupEntries[0].album);
      continue;
    }

    // Zoek het parent album, of neem het eerste album als basis
    const explicitParent = groupEntries.find(
      (e) =>
        slugify(e.album.title) === groupKey ||
        e.album.slug === groupKey ||
        !e.markers.parent,
    );
    const parentEntry = explicitParent || groupEntries[0];

    let compositeTitle = parentEntry.album.title;
    if (parentEntry.markers.group) {
      compositeTitle = parentEntry.markers.group;
    } else if (parentEntry.markers.parent && !explicitParent) {
      compositeTitle = parentEntry.markers.parent;
    }

    // Zorg dat het ouder-album (hoofdtitel) voorop staat in de tabs
    const orderedEntries = explicitParent
      ? [explicitParent, ...groupEntries.filter((e) => e !== explicitParent)]
      : groupEntries;

    const allocateTabSlug = createSlugAllocator();
    const subAlbums: GallerySubAlbum[] = orderedEntries.map((entry) => {
      const isParent = entry === parentEntry;
      const tabTitle = resolveTabTitle(entry, isParent, orderedEntries.length > 1);
      const tabSlug = allocateTabSlug(tabTitle);

      const photos = downloadPath
        ? entry.album.photos.map((p) => ({
            ...p,
            downloadUrl: downloadPath(groupKey, p.id),
          }))
        : entry.album.photos;

      return {
        id: entry.album.id,
        slug: tabSlug,
        title: tabTitle,
        photoCount: entry.album.photoCount,
        coverPhoto: entry.album.coverPhoto,
        photos,
        shareUrl: entry.album.shareUrl,
      };
    });

    const totalPhotos = subAlbums.flatMap((sub) => sub.photos);
    const totalPhotoCount = subAlbums.reduce((acc, sub) => acc + sub.photoCount, 0);

    // Vroegste datum bepalen van de deelalbums
    const validDates = groupEntries
      .map((e) => e.album.date)
      .filter((d): d is string => typeof d === 'string' && dateValue(d) > 0);

    let compositeDate = parentEntry.album.date;
    if (validDates.length > 0) {
      validDates.sort((a, b) => dateValue(a) - dateValue(b));
      compositeDate = validDates[0];
    }


    const compositeYear = compositeDate ? new Date(compositeDate).getUTCFullYear() : parentEntry.album.year;

    const compositeAlbum: GalleryAlbum = {
      ...parentEntry.album,
      slug: groupKey,
      title: compositeTitle,
      date: compositeDate,
      year: Number.isFinite(compositeYear) ? compositeYear : null,
      photoCount: totalPhotoCount,
      photos: totalPhotos,
      subAlbums,
    };

    result.push(compositeAlbum);
  }

  // Sorteer alle albums (zowel standalone als gegroepeerd) chronologisch op datum (aflopend)
  result.sort((left, right) => {
    const diff = dateValue(right.date) - dateValue(left.date);
    if (diff !== 0) return diff;
    return left.title.localeCompare(right.title);
  });

  return result;
}

