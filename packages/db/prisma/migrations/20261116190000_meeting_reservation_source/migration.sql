-- Herkomst van een bureau-inschrijving (`?via=` en `?c=`), voor de tab
-- Statistieken op /admin/bureau.
--
-- Wat er met bestaande rijen gebeurt: source en sourceCampaign blijven NULL.
-- Dat is geen keuze maar een meting die er niet was; het scherm toont ze als
-- "niet gemeten", nooit als "rechtstreeks". Geen backfill.

-- AlterTable
ALTER TABLE "MeetingReservation" ADD COLUMN "source" TEXT,
ADD COLUMN "sourceCampaign" TEXT;
