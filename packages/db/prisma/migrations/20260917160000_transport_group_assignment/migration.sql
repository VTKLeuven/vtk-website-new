-- Een autorit kan aan een post doorgegeven worden, die dan zelf een chauffeur aanduidt.
ALTER TABLE "UitleenTransportBooking" ADD COLUMN "assignedGroupId" TEXT;

CREATE INDEX "UitleenTransportBooking_assignedGroupId_startAt_idx" ON "UitleenTransportBooking"("assignedGroupId", "startAt");

ALTER TABLE "UitleenTransportBooking" ADD CONSTRAINT "UitleenTransportBooking_assignedGroupId_fkey" FOREIGN KEY ("assignedGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Het nummer waarop een chauffeur onderweg bereikbaar is.
ALTER TABLE "UitleenDriver" ADD COLUMN "phone" TEXT;
