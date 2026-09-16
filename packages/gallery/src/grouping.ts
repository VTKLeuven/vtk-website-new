import { createSlugAllocator, slugify, type ParsedAlbumMarkers } from './format';
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
 * 3. Titelpatronen met scheidingsteken (bijv. "Galabal 2026: Zaal" en "Galabal 2026: Photobooth")
 *    mits er 2 of meer albums zijn die hetzelfde voorvoegsel delen.
 */
export function groupAlbums(
  entries: MappedAlbumEntry[],
  downloadPath?: (slug: string, assetId: string) => string,
): GalleryAlbum[] {
  if (entries.length === 0) return [];

  // Tel voorvoegsels in titels ("Event: Tab" of "Event // Tab")
  const prefixCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.markers.titlePrefix) {
      const key = slugify(entry.markers.titlePrefix);
      prefixCounts.set(key, (prefixCounts.get(key) || 0) + 1);
    }
  }

  // Wijs elk album toe aan een groepssleutel (indien van toepassing)
  const entryGroupKey = new Map<MappedAlbumEntry, string>();
  for (const entry of entries) {
    if (entry.markers.parent) {
      entryGroupKey.set(entry, slugify(entry.markers.parent));
    } else if (entry.markers.group) {
      entryGroupKey.set(entry, slugify(entry.markers.group));
    } else if (entry.markers.titlePrefix) {
      const key = slugify(entry.markers.titlePrefix);
      if ((prefixCounts.get(key) || 0) > 1) {
        entryGroupKey.set(entry, key);
      }
    }
  }

  // Groepeer op sleutel
  const groups = new Map<string, MappedAlbumEntry[]>();
  const standalone: MappedAlbumEntry[] = [];

  for (const entry of entries) {
    const key = entryGroupKey.get(entry);
    if (!key) {
      // Controleer of dit album toevallig de parent is van een andere groep
      const selfKey = slugify(entry.album.title);
      let isTargeted = false;
      for (const other of entries) {
        if (entryGroupKey.get(other) === selfKey && other !== entry) {
          isTargeted = true;
          break;
        }
      }

      if (isTargeted) {
        entryGroupKey.set(entry, selfKey);
        const list = groups.get(selfKey) || [];
        list.push(entry);
        groups.set(selfKey, list);
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
      (e) => slugify(e.album.title) === groupKey || !e.markers.parent,
    );
    const parentEntry = explicitParent || groupEntries[0];

    let compositeTitle = parentEntry.album.title;
    if (parentEntry.markers.titlePrefix) {
      compositeTitle = parentEntry.markers.titlePrefix;
    } else if (parentEntry.markers.group) {
      compositeTitle = parentEntry.markers.group;
    } else if (parentEntry.markers.parent && !explicitParent) {
      compositeTitle = parentEntry.markers.parent;
    }

    const allocateTabSlug = createSlugAllocator();
    const subAlbums: GallerySubAlbum[] = groupEntries.map((entry) => {
      const isParent = entry === parentEntry;
      const tabTitle = resolveTabTitle(entry, isParent, groupEntries.length > 1);
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

    const compositeAlbum: GalleryAlbum = {
      ...parentEntry.album,
      slug: groupKey,
      title: compositeTitle,
      photoCount: totalPhotoCount,
      photos: totalPhotos,
      subAlbums,
    };

    result.push(compositeAlbum);
  }

  return result;
}
