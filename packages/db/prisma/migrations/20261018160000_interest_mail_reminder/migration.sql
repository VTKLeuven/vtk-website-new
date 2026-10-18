-- De herinneringsmail de dag voor een evenement waarin een lid interesse
-- aanduidde, om 12u, voor wie de mailinglijst Evenementen aan heeft.
-- Bestaande interesses: NULL, dus "nog geen mail gehad". Dat klopt voor elk
-- evenement dat nog moet komen: wie al interesse aanduidde voor iets van
-- overmorgen, krijgt morgen om 12u gewoon zijn herinnering. Voorbije
-- evenementen vallen buiten het venster van de worker, dus daar vertrekt niets.

-- AlterTable
ALTER TABLE "CalendarEventInterest" ADD COLUMN     "mailRemindedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "CalendarEventInterest_mailRemindedAt_idx" ON "CalendarEventInterest"("mailRemindedAt");

