-- Registratie van de jaarlijkse studiebevestiging en dagelijkse tellingen van
-- de mailinglijsten, voor /admin/mailinglijsten.
--
-- Beide tabellen starten leeg, en dat is bewust. Wie voor deze migratie al
-- bevestigde (de ronde 26-27 opende op 21 september), heeft geen rij: via welk
-- scherm dat gebeurde en of de Career-vraag erop stond, is achteraf niet meer te
-- weten, want de bevestiging overschrijft net het profiel waar die vraag van
-- afhing. De admin toont die groep apart als "niet geregistreerd" in plaats van
-- een schatting als meting op te slaan. Bestaande leden veranderen hier niet.
--
-- De tellingen hebben evenmin een verleden: een mailinglijst is een
-- momentopname. De grafiek vult vanaf de eerste ronde van de background-worker.

-- CreateEnum
CREATE TYPE "StudyConfirmationVia" AS ENUM ('ONBOARDING', 'CONFIRMATION', 'ACCOUNT');

-- CreateTable
CREATE TABLE "StudyConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "via" "StudyConfirmationVia" NOT NULL,
    "careerBefore" BOOLEAN NOT NULL,
    "careerAsked" BOOLEAN NOT NULL,
    "careerChosen" BOOLEAN NOT NULL,
    "studyYears" "StudyYear"[] DEFAULT ARRAY[]::"StudyYear"[],
    "studyProgrammes" "StudyProgramme"[] DEFAULT ARRAY[]::"StudyProgramme"[],
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingListDailyCount" (
    "day" DATE NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MailingListDailyCount_pkey" PRIMARY KEY ("day","key")
);

-- CreateIndex
CREATE INDEX "StudyConfirmation_year_confirmedAt_idx" ON "StudyConfirmation"("year", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyConfirmation_userId_year_key" ON "StudyConfirmation"("userId", "year");

-- AddForeignKey
ALTER TABLE "StudyConfirmation" ADD CONSTRAINT "StudyConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
