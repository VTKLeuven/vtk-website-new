-- CreateEnum
CREATE TYPE "UitleenAuditKind" AS ENUM ('STATUS_CHANGED', 'PAYMENT_MARKED', 'EDITED', 'NOTE');

-- CreateTable
CREATE TABLE "UitleenAuditLog" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "transportBookingId" TEXT,
    "kind" "UitleenAuditKind" NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UitleenAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenAuditLog_reservationId_createdAt_idx" ON "UitleenAuditLog"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "UitleenAuditLog_transportBookingId_createdAt_idx" ON "UitleenAuditLog"("transportBookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "UitleenAuditLog" ADD CONSTRAINT "UitleenAuditLog_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "UitleenReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenAuditLog" ADD CONSTRAINT "UitleenAuditLog_transportBookingId_fkey" FOREIGN KEY ("transportBookingId") REFERENCES "UitleenTransportBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenAuditLog" ADD CONSTRAINT "UitleenAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
