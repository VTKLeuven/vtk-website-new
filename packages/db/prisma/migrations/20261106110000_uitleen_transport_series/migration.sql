-- Herhaalde ritten (F6.22): een reeks is een rij gewone ritten met dezelfde
-- `seriesId`.
--
-- Wat bestaande ritten krijgen: `NULL`, "geen deel van een reeks". Dat is het
-- eerlijke antwoord en er komt geen backfill: niemand kan achteraf weten welke
-- oude ritten bij elkaar hoorden, en een gegokte reeks zou "verwijder deze en
-- alle volgende" op ritten laten werken die nooit samen gepland werden. Elk
-- scherm dat de reeks toont, moet "geen reeks" aankunnen. Gevraagd en beslist op
-- 6 november 2026.
ALTER TABLE "UitleenTransportBooking" ADD COLUMN "seriesId" TEXT;
CREATE INDEX "UitleenTransportBooking_seriesId_idx" ON "UitleenTransportBooking"("seriesId");
