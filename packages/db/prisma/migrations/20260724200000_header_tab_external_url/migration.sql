-- Externe bestemming per headertab: staat die ingevuld, dan linkt de
-- hoofdnavigatie rechtstreeks naar die site in plaats van naar /<slug>.
ALTER TABLE "HeaderTab" ADD COLUMN "externalUrl" TEXT;

-- De seed maakt headertabs enkel aan (bestaande rijen worden nooit
-- overschreven), dus Career zou op een bestaande database zonder bestemming
-- blijven staan. Die zetten we hier eenmalig.
UPDATE "HeaderTab" SET "externalUrl" = 'https://career.vtk.be' WHERE "code" = 'CAREER';
