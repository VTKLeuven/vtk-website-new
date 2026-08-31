-- Tot nu toe stuurde visibleInHeader zowel de hover-dropdown als de kaarten op
-- de categoriepagina aan. Splits die keuzes, maar kopieer de bestaande waarde
-- zodat de migratie geen enkele pagina onverwacht zichtbaar of onzichtbaar maakt.
ALTER TABLE "Page"
ADD COLUMN "visibleOnCategoryPage" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Page"
SET "visibleOnCategoryPage" = "visibleInHeader";
