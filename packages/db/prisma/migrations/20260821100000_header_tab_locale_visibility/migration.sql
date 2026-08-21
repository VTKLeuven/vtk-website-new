-- AlterTable
ALTER TABLE "HeaderTab" ADD COLUMN "visibleNl" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "HeaderTab" ADD COLUMN "visibleEn" BOOLEAN NOT NULL DEFAULT true;

-- Update defaults for Eerstejaars (NL only) and Internationaal (EN only)
UPDATE "HeaderTab" SET "visibleEn" = false WHERE "code" = 'EERSTEJAARS';
UPDATE "HeaderTab" SET "visibleNl" = false WHERE "code" = 'INTERNATIONAAL';
