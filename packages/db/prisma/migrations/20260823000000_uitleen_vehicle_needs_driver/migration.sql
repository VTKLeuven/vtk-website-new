-- AlterTable
ALTER TABLE "UitleenVehicle" ADD COLUMN     "needsDriver" BOOLEAN NOT NULL DEFAULT true;

-- De bakfiets neemt de aanvrager zelf mee; de kar en de auto worden door
-- Logistiek gereden. Het team kan dit per voertuig bijstellen.
UPDATE "UitleenVehicle" SET "needsDriver" = false WHERE "code" = 'bakfiets';
