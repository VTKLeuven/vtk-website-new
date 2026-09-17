-- Foto's die uit hun album gehaald zijn maar in Immich blijven staan, zodat het
-- beheer ze kan tonen en terugzetten. Zonder deze rij is zo'n foto nergens meer
-- terug te vinden: de publieke foto-URL's hangen aan de gedeelde link van een album.
CREATE TABLE "GalleryDetachedPhoto" (
    "id" TEXT NOT NULL,
    "gallery" "PhotoTakedownGallery" NOT NULL,
    "assetId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "albumTitle" TEXT NOT NULL,
    "tabName" TEXT,
    "filename" TEXT,
    "detachedById" TEXT,
    "detachedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryDetachedPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GalleryDetachedPhoto_assetId_key" ON "GalleryDetachedPhoto"("assetId");
CREATE INDEX "GalleryDetachedPhoto_gallery_albumId_idx" ON "GalleryDetachedPhoto"("gallery", "albumId");

ALTER TABLE "GalleryDetachedPhoto" ADD CONSTRAINT "GalleryDetachedPhoto_detachedById_fkey" FOREIGN KEY ("detachedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
