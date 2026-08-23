-- AlterTable
ALTER TABLE "UitleenEvent" ADD COLUMN     "endAt" TIMESTAMPTZ(3),
ADD COLUMN     "startTimeKnown" BOOLEAN NOT NULL DEFAULT true;

-- Bestaande evenementen kregen hun uur via een verplicht veld, dus dat uur is
-- ingevuld; enkel wie helemaal geen startmoment heeft, weet ook het uur niet.
UPDATE "UitleenEvent" SET "startTimeKnown" = false WHERE "startAt" IS NULL;
