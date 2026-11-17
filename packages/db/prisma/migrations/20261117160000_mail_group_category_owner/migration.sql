-- Een categorie van groepsadressen kan bij een werkgroep horen
-- (Werkgroepen › Biomedix). Bestaande categorieën krijgen geen werkgroep:
-- niets verandert aan wie een adres nu beheert tot iemand er een kiest.

ALTER TABLE "MailGroupCategory" ADD COLUMN "ownerGroupId" TEXT;

CREATE INDEX "MailGroupCategory_ownerGroupId_idx" ON "MailGroupCategory"("ownerGroupId");

ALTER TABLE "MailGroupCategory" ADD CONSTRAINT "MailGroupCategory_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
