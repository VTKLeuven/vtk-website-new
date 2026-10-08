-- PAL+: tags, het rooster "wanneer kan je?" en een tweede tutor die zelf
-- bevestigt. Het ene voorgestelde moment van een aanbod verdwijnt: het rooster
-- en een opmerking vervangen het.
--
-- Wat er met bestaande rijen gebeurt (PAL+ staat sinds 4 oktober 2026 op
-- dev.vtk.be, dus er kunnen al aanvragen zijn):
-- - Een aanbod met een voorgesteld moment houdt dat moment als opmerking
--   ("Voorgesteld moment: ..."), in Brusselse tijd, voor de kolommen weggaan.
--   Het rooster blijft leeg: welke andere momenten de tutor paste, weet niemand.
-- - Een hulpvraag die al bestond, stond meteen publiek (het nakijken kwam pas
--   later). Ze krijgt `reviewedAt` = het moment van indienen, zodat een
--   geannuleerde sessie ze terug online zet zoals vroeger, en niet in het
--   werkbakje. `reviewedById` blijft leeg: niemand keek ze echt na.
-- - Tags starten leeg; de tweede tutor is nullable en blijft leeg.

-- CreateEnum
CREATE TYPE "PalPlusCoTutorStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "PalPlusRequest"
ADD COLUMN     "availability" JSONB,
ADD COLUMN     "availabilityNote" TEXT,
ADD COLUMN     "coTutorId" TEXT,
ADD COLUMN     "coTutorRespondedAt" TIMESTAMPTZ(3),
ADD COLUMN     "coTutorStatus" "PalPlusCoTutorStatus",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: het voorgestelde moment van een bestaand aanbod als opmerking.
UPDATE "PalPlusRequest"
SET "availabilityNote" = 'Voorgesteld moment: '
    || to_char("proposedStartsAt" AT TIME ZONE 'Europe/Brussels', 'DD/MM/YYYY HH24:MI')
    || ' - '
    || to_char("proposedEndsAt" AT TIME ZONE 'Europe/Brussels', 'HH24:MI')
WHERE "kind" = 'GIVE' AND "proposedStartsAt" IS NOT NULL AND "proposedEndsAt" IS NOT NULL;

-- Backfill: een bestaande hulpvraag stond al online.
UPDATE "PalPlusRequest"
SET "reviewedAt" = "createdAt"
WHERE "kind" = 'FOLLOW' AND "status" IN ('OPEN', 'PLANNED') AND "reviewedAt" IS NULL;

ALTER TABLE "PalPlusRequest" DROP CONSTRAINT IF EXISTS "PalPlusRequest_proposed_check";
ALTER TABLE "PalPlusRequest" DROP COLUMN "proposedEndsAt",
DROP COLUMN "proposedStartsAt";

-- AlterTable
ALTER TABLE "PalPlusSession" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PalPlusTag" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PalPlusTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalPlusDaypart" (
    "id" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PalPlusDaypart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PalPlusTag_label_key" ON "PalPlusTag"("label");

-- CreateIndex
CREATE INDEX "PalPlusRequest_coTutorId_idx" ON "PalPlusRequest"("coTutorId");

-- AddForeignKey
ALTER TABLE "PalPlusRequest" ADD CONSTRAINT "PalPlusRequest_coTutorId_fkey" FOREIGN KEY ("coTutorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Wat de code al afdwingt, ook in de databank.
ALTER TABLE "PalPlusRequest"
    ADD CONSTRAINT "PalPlusRequest_cotutor_check" CHECK ("coTutorId" IS NULL OR "coTutorId" <> "userId");
ALTER TABLE "PalPlusDaypart"
    ADD CONSTRAINT "PalPlusDaypart_minutes_check" CHECK ("startMinutes" >= 0 AND "endMinutes" <= 1440 AND "startMinutes" < "endMinutes");

-- Een vertrekpunt, zodat het formulier vanaf de eerste dag werkt: de seed draait
-- niet bij een deploy. Onderwijs past beide lijsten aan in /admin/pal-plus.
-- De createdAt-waarden houden de volgorde vast waarin de tags getoond worden.
INSERT INTO "PalPlusTag" ("id", "label", "active", "createdAt", "updatedAt") VALUES
    ('palplus_tag_theorie', 'Theorie', true, TIMESTAMPTZ '2026-10-05 10:00:00+02', TIMESTAMPTZ '2026-10-05 10:00:00+02'),
    ('palplus_tag_oefeningen', 'Oefeningen', true, TIMESTAMPTZ '2026-10-05 10:00:01+02', TIMESTAMPTZ '2026-10-05 10:00:01+02'),
    ('palplus_tag_examen', 'Examenvoorbereiding', true, TIMESTAMPTZ '2026-10-05 10:00:02+02', TIMESTAMPTZ '2026-10-05 10:00:02+02'),
    ('palplus_tag_labo', 'Labo of project', true, TIMESTAMPTZ '2026-10-05 10:00:03+02', TIMESTAMPTZ '2026-10-05 10:00:03+02');

INSERT INTO "PalPlusDaypart" ("id", "labelNl", "labelEn", "startMinutes", "endMinutes", "active", "updatedAt") VALUES
    ('palplus_daypart_voormiddag', 'Voormiddag', 'Morning', 480, 720, true, CURRENT_TIMESTAMP),
    ('palplus_daypart_namiddag', 'Namiddag', 'Afternoon', 780, 1080, true, CURRENT_TIMESTAMP),
    ('palplus_daypart_avond', 'Avond', 'Evening', 1080, 1320, true, CURRENT_TIMESTAMP);
