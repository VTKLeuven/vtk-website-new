-- Privélinks naar een album: Communicatie deelt een album dat niet op de site
-- staat met wie de link krijgt, eventueel enkel met het praesidium of met één
-- werkgroep. Een nieuwe tabel, dus geen bestaande rijen om over te beslissen;
-- zolang er geen link in staat, verandert er op de site niets.
--
-- Het token zelf staat nergens leesbaar: "tokenHash" is de sha256 om op te
-- zoeken, "tokenSecret" een versleutelde kopie om de link opnieuw te kopiëren.
-- Zie docs/immich-gallery.md, "Een album delen met een link".

-- CreateEnum
CREATE TYPE "GalleryShareAudience" AS ENUM ('LINK', 'PRAESIDIUM', 'GROUP');

-- CreateTable
CREATE TABLE "GalleryShareLink" (
    "id" TEXT NOT NULL,
    "gallery" "PhotoTakedownGallery" NOT NULL,
    "albumId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenSecret" TEXT NOT NULL,
    "audience" "GalleryShareAudience" NOT NULL DEFAULT 'LINK',
    "groupId" TEXT,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GalleryShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GalleryShareLink_tokenHash_key" ON "GalleryShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "GalleryShareLink_gallery_albumId_idx" ON "GalleryShareLink"("gallery", "albumId");

-- CreateIndex
CREATE INDEX "GalleryShareLink_groupId_idx" ON "GalleryShareLink"("groupId");

-- AddForeignKey
ALTER TABLE "GalleryShareLink" ADD CONSTRAINT "GalleryShareLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryShareLink" ADD CONSTRAINT "GalleryShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Een link voor één werkgroep draagt die werkgroep, en enkel zo'n link. Zonder
-- deze regel kon een GROUP-link zonder groep bestaan, en dan beslist de code of
-- dat "niemand" of "iedereen" betekent.
ALTER TABLE "GalleryShareLink" ADD CONSTRAINT "GalleryShareLink_group_audience_check"
  CHECK (("audience" = 'GROUP') = ("groupId" IS NOT NULL));
