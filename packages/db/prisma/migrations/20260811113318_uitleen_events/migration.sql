-- AlterTable
ALTER TABLE "UitleenItem" ADD COLUMN     "volumeLiters" INTEGER;

-- AlterTable
ALTER TABLE "UitleenReservation" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "UitleenTransportBooking" ADD COLUMN     "eventId" TEXT;

-- CreateTable
CREATE TABLE "UitleenEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "startAt" TIMESTAMPTZ(3),
    "groupId" TEXT,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenEvent_startAt_idx" ON "UitleenEvent"("startAt");

-- CreateIndex
CREATE INDEX "UitleenEvent_groupId_idx" ON "UitleenEvent"("groupId");

-- CreateIndex
CREATE INDEX "UitleenReservation_eventId_idx" ON "UitleenReservation"("eventId");

-- CreateIndex
CREATE INDEX "UitleenTransportBooking_eventId_idx" ON "UitleenTransportBooking"("eventId");

-- AddForeignKey
ALTER TABLE "UitleenEvent" ADD CONSTRAINT "UitleenEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenEvent" ADD CONSTRAINT "UitleenEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservation" ADD CONSTRAINT "UitleenReservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UitleenEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UitleenEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
