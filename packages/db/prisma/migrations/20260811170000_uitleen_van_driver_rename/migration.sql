-- "Met de kar rijden" ging over de bestelwagen, niet over een aanhangwagen; VTK
-- heeft er geen. De velden heetten `needsTrailerDriver` en `canDriveTrailer`.
--
-- Hernoemen en niet droppen-en-toevoegen: de vlaggen die het team al gezet heeft
-- moeten blijven staan, en een nieuwe kolom met een default zou ze stil op
-- "rijdt niet met de kar" zetten. Dat merk je pas wanneer de keuzelijst bij een
-- rit met de kar plots iedereen onderaan zet.
ALTER TABLE "UitleenVehicle" RENAME COLUMN "needsTrailerDriver" TO "needsVanDriver";
ALTER TABLE "UitleenDriver" RENAME COLUMN "canDriveTrailer" TO "canDriveVan";

-- De seed gaf het voertuig "kar" de Engelse naam "Trailer" mee. Enkel die exacte
-- waarde wordt rechtgezet: heeft het team de naam zelf al aangepast, dan blijft
-- hun keuze staan.
UPDATE "UitleenVehicle" SET "nameEn" = 'Van' WHERE "code" = 'kar' AND "nameEn" = 'Trailer';
