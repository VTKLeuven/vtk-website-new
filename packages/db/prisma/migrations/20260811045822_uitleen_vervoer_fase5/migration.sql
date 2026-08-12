-- CreateEnum
CREATE TYPE "UitleenTripLeg" AS ENUM ('HEEN', 'TERUG');

-- AlterTable
ALTER TABLE "UitleenDriver" ADD COLUMN     "canDriveTrailer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UitleenTransportBooking" ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "helpersPhone" TEXT,
ADD COLUMN     "tripGroupId" TEXT,
ADD COLUMN     "tripLeg" "UitleenTripLeg";

-- AlterTable
ALTER TABLE "UitleenVehicle" ADD COLUMN     "needsTrailerDriver" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "UitleenTransportBooking_tripGroupId_idx" ON "UitleenTransportBooking"("tripGroupId");
