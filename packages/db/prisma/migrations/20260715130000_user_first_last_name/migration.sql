-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- Backfill: eerste woord = voornaam, de rest = achternaam. Zonder spatie in de
-- naam blijft de achternaam leeg (NULLIF vergelijkt het restant met de volledige
-- naam, wat enkel gelijk is als er geen spatie in zat).
UPDATE "User"
SET "firstName" = split_part(btrim("name"), ' ', 1),
    "lastName"  = NULLIF(
      btrim(substring(btrim("name") from position(' ' in btrim("name")) + 1)),
      btrim("name")
    );
