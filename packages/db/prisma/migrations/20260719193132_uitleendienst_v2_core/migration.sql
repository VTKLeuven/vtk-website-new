/*
  Warnings:

  - You are about to drop the column `vanBookingId` on the `UitleenPayment` table. All the data in the column will be lost.
  - You are about to drop the `UitleenVanBooking` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `eventName` to the `UitleenReservation` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UitleenTransportBookingStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UitleenRequesterType" AS ENUM ('INTERN', 'WERKGROEP', 'EXTERN');

-- CreateEnum
CREATE TYPE "UitleenPricingMode" AS ENUM ('FREE', 'PER_HOUR', 'PER_KM', 'FLAT');

-- CreateEnum
CREATE TYPE "UitleenItemCondition" AS ENUM ('WERKT', 'KAPOT', 'TESTEN', 'ONVOLLEDIG');

-- DropForeignKey
ALTER TABLE "UitleenPayment" DROP CONSTRAINT "UitleenPayment_vanBookingId_fkey";

-- DropForeignKey
ALTER TABLE "UitleenVanBooking" DROP CONSTRAINT "UitleenVanBooking_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "UitleenVanBooking" DROP CONSTRAINT "UitleenVanBooking_driverId_fkey";

-- DropForeignKey
ALTER TABLE "UitleenVanBooking" DROP CONSTRAINT "UitleenVanBooking_userId_fkey";

-- DropIndex
DROP INDEX "UitleenPayment_vanBookingId_status_idx";

-- AlterTable
ALTER TABLE "UitleenItem" ADD COLUMN     "condition" "UitleenItemCondition" NOT NULL DEFAULT 'WERKT',
ADD COLUMN     "conditionNote" TEXT,
ADD COLUMN     "isSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locationRack" TEXT,
ADD COLUMN     "locationShelf" TEXT;

-- AlterTable
ALTER TABLE "UitleenPayment" DROP COLUMN "vanBookingId",
ADD COLUMN     "transportBookingId" TEXT;

-- AlterTable
ALTER TABLE "UitleenReservation" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "delivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "eventLocation" TEXT,
ADD COLUMN     "eventName" TEXT NOT NULL,
ADD COLUMN     "eventStart" TIMESTAMPTZ(3),
ADD COLUMN     "expectedAttendance" INTEGER,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "requesterName" TEXT,
ADD COLUMN     "requesterType" "UitleenRequesterType" NOT NULL DEFAULT 'INTERN';

-- DropTable
DROP TABLE "UitleenVanBooking";

-- DropEnum
DROP TYPE "UitleenVanBookingStatus";

-- CreateTable
CREATE TABLE "UitleenSetContent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UitleenSetContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenVehicle" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "description" TEXT,
    "pricingMode" "UitleenPricingMode" NOT NULL DEFAULT 'FREE',
    "rateCents" INTEGER NOT NULL DEFAULT 0,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenTransportBooking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "UitleenTransportBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "requesterType" "UitleenRequesterType" NOT NULL DEFAULT 'INTERN',
    "groupId" TEXT,
    "requesterName" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "eventName" TEXT,
    "purpose" TEXT NOT NULL,
    "pickupAddress" TEXT,
    "destination" TEXT,
    "helpersNote" TEXT,
    "driverId" TEXT,
    "pricingMode" "UitleenPricingMode" NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "kilometers" INTEGER,
    "priceCents" INTEGER,
    "paymentMode" "UitleenPaymentMode",
    "paidOfflineAt" TIMESTAMP(3),
    "memberNote" TEXT,
    "adminNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenTransportBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenSetContent_itemId_sortIndex_idx" ON "UitleenSetContent"("itemId", "sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "UitleenVehicle_code_key" ON "UitleenVehicle"("code");

-- CreateIndex
CREATE INDEX "UitleenTransportBooking_userId_idx" ON "UitleenTransportBooking"("userId");

-- CreateIndex
CREATE INDEX "UitleenTransportBooking_status_startAt_idx" ON "UitleenTransportBooking"("status", "startAt");

-- CreateIndex
CREATE INDEX "UitleenTransportBooking_startAt_endAt_idx" ON "UitleenTransportBooking"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "UitleenTransportBooking_vehicleId_status_idx" ON "UitleenTransportBooking"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "UitleenTransportBooking_requesterType_status_idx" ON "UitleenTransportBooking"("requesterType", "status");

-- CreateIndex
CREATE INDEX "UitleenPayment_transportBookingId_status_idx" ON "UitleenPayment"("transportBookingId", "status");

-- CreateIndex
CREATE INDEX "UitleenReservation_requesterType_status_idx" ON "UitleenReservation"("requesterType", "status");

-- AddForeignKey
ALTER TABLE "UitleenSetContent" ADD CONSTRAINT "UitleenSetContent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservation" ADD CONSTRAINT "UitleenReservation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "UitleenVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenPayment" ADD CONSTRAINT "UitleenPayment_transportBookingId_fkey" FOREIGN KEY ("transportBookingId") REFERENCES "UitleenTransportBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
