-- "Niet in de begrotingsstand": een bestand telt mee in het overzicht van de
-- budgetten en resultaten, maar niet in de stand tegenover de begroting.
-- Bestaande rijen krijgen NULL: ze tellen mee zoals tot nu toe.
ALTER TABLE "BoDocument" ADD COLUMN "begrotingExcludedAt" TIMESTAMPTZ(3),
ADD COLUMN "begrotingExcludedReason" TEXT;
