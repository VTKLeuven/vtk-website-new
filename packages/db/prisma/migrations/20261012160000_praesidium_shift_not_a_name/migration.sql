-- "Geen naam" op een shiftenlijst van het praesidium: een post, taak of
-- opmerking in een vakje ("Cultuur", "Iedereen") telt voor niemand en niet mee
-- in de totalen. Bestaande namen en bijnamen veranderen niet: een bestaande
-- bijnaam zonder persoon krijgt `notAName = false` en blijft dus "geen
-- praesidium", zoals ze gekozen was.

-- AlterEnum
ALTER TYPE "PraesidiumShiftNameStatus" ADD VALUE 'NOT_A_NAME';

-- AlterTable
ALTER TABLE "PraesidiumShiftAlias" ADD COLUMN "notAName" BOOLEAN NOT NULL DEFAULT false;
