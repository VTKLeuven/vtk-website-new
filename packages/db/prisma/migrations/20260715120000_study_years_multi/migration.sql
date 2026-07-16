-- AlterTable: studyYear (één waarde) wordt studyYears (meerdere waarden).
ALTER TABLE "User" ADD COLUMN     "studyYears" "StudyYear"[] DEFAULT ARRAY[]::"StudyYear"[];

-- Bestaande keuze overzetten naar een array van één element.
UPDATE "User" SET "studyYears" = ARRAY["studyYear"] WHERE "studyYear" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "studyYear";
