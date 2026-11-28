-- Een bijrijdshift kent haar rit: een shift op vtk.be (zoals C&G) kan aan een
-- rit van de uitleendienst hangen, en wie ingeschreven is, ziet dan wie er rijdt
-- en op welk nummer. Zie docs/design-decisions.md, "Een bijrijdshift kent haar rit".
--
-- Wat er met bestaande rijen gebeurt: elke bestaande shift krijgt
-- `transportBookingId = NULL` en is dus geen bijrijdshift; /shift en de
-- herinneringsmail tonen daar niets nieuws. Geen backfill: welke oude shift bij
-- welke rit hoorde, staat nergens, en raden op het uur zou het verkeerde nummer
-- kunnen geven. Aan de ritten zelf verandert niets: dit is een kolom op `Shift`,
-- niet op `UitleenTransportBooking`.

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "transportBookingId" TEXT;

-- CreateIndex
CREATE INDEX "Shift_transportBookingId_idx" ON "Shift"("transportBookingId");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_transportBookingId_fkey" FOREIGN KEY ("transportBookingId") REFERENCES "UitleenTransportBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
