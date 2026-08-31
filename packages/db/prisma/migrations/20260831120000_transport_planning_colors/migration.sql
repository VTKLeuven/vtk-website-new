-- Kleur per chauffeur en arcering per voertuig in de transportplanning (K1).
--
-- Beide zijn nullable en blijven leeg: `null` betekent "de standaard", en die
-- standaard is wat er vandaag al staat. De kleur van een chauffeur volgt dan uit
-- de hash van zijn id (lib/driver-colors.ts), en een voertuig heeft geen
-- arcering. Zo verandert er niets aan een bestaande planning tot iemand op
-- /beheer/chauffeurs of /beheer/instellingen effectief iets kiest.
ALTER TABLE "UitleenDriver" ADD COLUMN "colorIndex" INTEGER;

ALTER TABLE "UitleenVehicle" ADD COLUMN "pattern" TEXT;
