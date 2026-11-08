-- Een eigen locatie, tekst en affiche per moment van een evenement.
--
-- Bestaande momenten krijgen overal NULL (en het midden als focuspunt, dat zonder
-- eigen affiche niet gebruikt wordt): ze volgen het evenement en zien er dus
-- hetzelfde uit als voordien. Er is geen backfill nodig.
ALTER TABLE "CalendarEventMoment"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "descriptionNl" TEXT,
  ADD COLUMN "descriptionEn" TEXT,
  ADD COLUMN "imageKey" TEXT,
  ADD COLUMN "imageFocusX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "imageFocusY" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
