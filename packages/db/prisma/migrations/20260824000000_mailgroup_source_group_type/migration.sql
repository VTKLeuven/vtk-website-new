-- "Elke actieve praesidiumpost" of "elke actieve werkgroep" als bron van een
-- groepsadres, in plaats van vijftien losse bronrijen die je moet aanvullen
-- zodra er een post bijkomt. Dat is wat een adres als praesidium@vtk.be nodig
-- heeft, en dat adres is meteen ook de sleutel tot de gedeelde drive.
-- Zie docs/design-decisions.md, "Gedeelde drives volgen de groepen".

-- AlterTable
ALTER TABLE "MailGroupSource" ADD COLUMN "groupType" "GroupType";

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupSource_mailGroupId_groupType_onlyLead_key" ON "MailGroupSource"("mailGroupId", "groupType", "onlyLead");
