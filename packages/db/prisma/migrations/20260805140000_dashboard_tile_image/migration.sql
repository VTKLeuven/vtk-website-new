-- Een dashboardtegel mag voortaan een eigen logo tonen in plaats van een
-- pictogram uit de gecureerde set (bv. het GitHub-logo naast een link naar de
-- repository). De storage-key staat in `imageKey`; is die NULL, dan valt de
-- tegel terug op `icon`. `icon` blijft dus altijd ingevuld, zodat het
-- verwijderen van de afbeelding geen lege tegel achterlaat.
ALTER TABLE "DashboardTile"
ADD COLUMN "imageKey" TEXT;

-- Op de persoonlijke override van een gedeelde tegel is één nullable kolom niet
-- genoeg: NULL betekent daar "erf wat de standaardtegel toont". Wie een gedeelde
-- tegel met logo persoonlijk terug naar een pictogram wil zetten, heeft dus een
-- expliciete vlag nodig; anders zou dat stil genegeerd worden.
ALTER TABLE "UserDashboardTilePref"
ADD COLUMN "imageKey" TEXT,
ADD COLUMN "imageCleared" BOOLEAN NOT NULL DEFAULT false;
