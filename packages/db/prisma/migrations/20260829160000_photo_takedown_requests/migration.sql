-- CreateEnum
CREATE TYPE "PhotoTakedownGallery" AS ENUM ('MAIN', 'FAKBAR');

-- CreateEnum
CREATE TYPE "PhotoTakedownReason" AS ENUM ('ON_PHOTO', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "PhotoTakedownStatus" AS ENUM ('NEW', 'DELETED', 'KEPT');

-- CreateTable
CREATE TABLE "PhotoTakedownRequest" (
    "id" TEXT NOT NULL,
    "gallery" "PhotoTakedownGallery" NOT NULL,
    "albumSlug" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "albumTitle" TEXT NOT NULL,
    "photoFilename" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterEmail" TEXT NOT NULL,
    "reason" "PhotoTakedownReason" NOT NULL,
    "message" TEXT,
    "status" "PhotoTakedownStatus" NOT NULL DEFAULT 'NEW',
    "handledById" TEXT,
    "handledAt" TIMESTAMPTZ(3),
    "handlingNote" TEXT,
    "mailDelivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PhotoTakedownRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhotoTakedownRequest_gallery_status_idx" ON "PhotoTakedownRequest"("gallery", "status");

-- CreateIndex
CREATE INDEX "PhotoTakedownRequest_assetId_idx" ON "PhotoTakedownRequest"("assetId");

-- AddForeignKey
ALTER TABLE "PhotoTakedownRequest" ADD CONSTRAINT "PhotoTakedownRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

