-- Een eigen chauffeurskleur met schuiven, naast het palet van veertig.
--
-- Wat bestaande chauffeurs krijgen: `NULL`, "geen eigen kleur". Hun
-- `colorIndex` of de kleur uit hun id blijft precies zoals ze was; niemand
-- verandert van kleur door deze migratie. Er is dus geen backfill.
ALTER TABLE "UitleenDriver" ADD COLUMN "customColor" TEXT;
