-- De prullenmand van het mediabeheer: foto's en albums die vanuit /admin/media
-- weggegooid zijn en daar 30 dagen terug te zetten blijven, zonder Immich.
-- Twee nieuwe tabellen; er bestaat nog niets dat erin hoort, dus geen backfill.

-- CreateTable
CREATE TABLE "GalleryTrashedPhoto" (
    "id" TEXT NOT NULL,
    "gallery" "PhotoTakedownGallery" NOT NULL,
    "assetId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "albumTitle" TEXT NOT NULL,
    "tabName" TEXT,
    "filename" TEXT,
    "trashedById" TEXT,
    "trashedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryTrashedPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryTrashedAlbum" (
    "id" TEXT NOT NULL,
    "gallery" "PhotoTakedownGallery" NOT NULL,
    "albumId" TEXT NOT NULL,
    "partIds" TEXT[],
    "title" TEXT NOT NULL,
    "photoCount" INTEGER NOT NULL,
    "wasHidden" BOOLEAN NOT NULL,
    "trashedById" TEXT,
    "trashedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryTrashedAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GalleryTrashedPhoto_assetId_key" ON "GalleryTrashedPhoto"("assetId");

-- CreateIndex
CREATE INDEX "GalleryTrashedPhoto_gallery_trashedAt_idx" ON "GalleryTrashedPhoto"("gallery", "trashedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryTrashedAlbum_albumId_key" ON "GalleryTrashedAlbum"("albumId");

-- CreateIndex
CREATE INDEX "GalleryTrashedAlbum_gallery_trashedAt_idx" ON "GalleryTrashedAlbum"("gallery", "trashedAt");

-- AddForeignKey
ALTER TABLE "GalleryTrashedPhoto" ADD CONSTRAINT "GalleryTrashedPhoto_trashedById_fkey" FOREIGN KEY ("trashedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryTrashedAlbum" ADD CONSTRAINT "GalleryTrashedAlbum_trashedById_fkey" FOREIGN KEY ("trashedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

