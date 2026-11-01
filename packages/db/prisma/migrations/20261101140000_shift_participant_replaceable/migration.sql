-- Vervangbaar op een shift. Bestaande inschrijvingen krijgen false: niemand
-- wordt vervangen zonder dat hij het zelf aanduidde, ook niet wie zich al
-- inschreef voor deze optie bestond.
ALTER TABLE "ShiftParticipant" ADD COLUMN "replaceable" BOOLEAN NOT NULL DEFAULT false;
