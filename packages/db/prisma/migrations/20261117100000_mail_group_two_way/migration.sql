-- Tweerichtingssync voor groepsadressen: de site onthoudt wie ze in Google
-- zette, zodat een wijziging in de Admin console overgenomen wordt in plaats
-- van teruggedraaid.
--
-- Wat er met bestaande rijen gebeurt: syncedMembers wordt een lege lijst en
-- syncBaselineAt NULL. De eerste ronde na deze migratie weet dus niet wat er
-- in Google verwijderd werd: ze neemt wat extra in Google staat over als los
-- lid en haalt niemand weg. Vanaf de tweede ronde werkt het in twee richtingen.

-- AlterTable
ALTER TABLE "MailGroup" ADD COLUMN "syncedMembers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "syncBaselineAt" TIMESTAMP(3);
