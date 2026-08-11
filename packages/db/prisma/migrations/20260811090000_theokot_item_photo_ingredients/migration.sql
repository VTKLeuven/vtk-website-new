-- Een broodje mag voortaan een foto en een ingrediëntenlijst hebben. Beide zijn
-- optioneel: NULL bij `imageKey` betekent dat de bestelpagina het gestreepte
-- placeholder-patroon toont, NULL bij `ingredients*` dat er geen info-icoontje
-- naast het broodje verschijnt.
--
-- De velden staan zowel op de catalogus (`TheokotProduct`) als op het
-- sessie-item (`TheokotSessionItem`): sessie-items zijn snapshots, dus ze krijgen
-- bij het aanmaken van een week een kopie mee en blijven daarna los van latere
-- catalogus-edits. `imageKey` wordt bewust wél gedeeld met de catalogus (dezelfde
-- storage-key), zodat een foto vervangen geen object verwijdert dat een oude
-- sessie nog toont.
ALTER TABLE "TheokotProduct" ADD COLUMN "imageKey" TEXT;
ALTER TABLE "TheokotProduct" ADD COLUMN "ingredientsNl" TEXT;
ALTER TABLE "TheokotProduct" ADD COLUMN "ingredientsEn" TEXT;

ALTER TABLE "TheokotSessionItem" ADD COLUMN "imageKey" TEXT;
ALTER TABLE "TheokotSessionItem" ADD COLUMN "ingredientsNl" TEXT;
ALTER TABLE "TheokotSessionItem" ADD COLUMN "ingredientsEn" TEXT;
