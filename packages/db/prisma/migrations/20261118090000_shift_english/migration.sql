-- Engelse naam, beschrijving en uitleg van een shift. Nullable: een bestaande
-- shift heeft geen Engelse tekst en toont in het Engels gewoon de Nederlandse
-- (lib/shift/localize.ts). Geen backfill: een vertaling valt niet af te leiden.
ALTER TABLE "Shift" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "Shift" ADD COLUMN "descriptionEn" TEXT;
ALTER TABLE "Shift" ADD COLUMN "instructionsEn" TEXT;
