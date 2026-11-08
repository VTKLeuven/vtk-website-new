import "server-only";

import { getImmichAsset } from "@/lib/immich-gallery";

type Photo = { id: string; filename: string; hidden: boolean; video: boolean };

/** Hoeveel verborgen foto's tegelijk bij Immich nagevraagd worden. */
const BATCH = 8;

/**
 * Geeft de verborgen foto's van een album hun echte naam en soort.
 *
 * Een verborgen foto zit in geen album meer, en haar rij in
 * `GalleryDetachedPhoto` bewaart geen bestandsnaam (de verberg-actie zet er
 * geen). `loadLibraryAlbum` kan haar dus enkel als `foto.jpg` zonder naam
 * tonen, en nooit als video. Dat volstaat voor een gedimde tegel, maar niet voor
 * een zip: daar zou elke verborgen foto `foto-0007.jpg` heten en een verborgen
 * video een `.jpg`-extensie krijgen.
 *
 * Een foto waar Immich niets over weet (of niet op antwoordt) blijft zoals ze
 * was; wat dan echt mis is, valt op wanneer haar origineel opent. Zichtbare
 * foto's staan al goed in de lijst en blijven onaangeraakt.
 */
export async function withHiddenPhotoDetails<T extends { photos: Photo[] }>(parts: T[]): Promise<T[]> {
  const hidden = parts.flatMap((part) => part.photos).filter((photo) => photo.hidden);
  if (hidden.length === 0) return parts;

  const details = new Map<string, { filename: string; video: boolean }>();
  for (let start = 0; start < hidden.length; start += BATCH) {
    await Promise.all(
      hidden.slice(start, start + BATCH).map(async (photo) => {
        const asset = await getImmichAsset(photo.id).catch(() => null);
        if (!asset) return;
        details.set(photo.id, {
          filename: photo.filename || asset.originalFileName || "",
          video: asset.type === "VIDEO",
        });
      }),
    );
  }

  return parts.map((part) => ({
    ...part,
    photos: part.photos.map((photo) => {
      const found = photo.hidden ? details.get(photo.id) : undefined;
      return found ? { ...photo, ...found } : photo;
    }),
  }));
}
