-- Het bestaande adres blijft het kotadres. De expliciete vlag onderscheidt
-- "geen kot" van een profiel dat zijn kotadres nog niet invulde.
ALTER TABLE "User"
ADD COLUMN "noKot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "homeStreet" TEXT,
ADD COLUMN "homeHouseNumber" TEXT,
ADD COLUMN "homeBus" TEXT,
ADD COLUMN "homePostalCode" TEXT,
ADD COLUMN "homeCity" TEXT;

-- Geen automatische backfill: een bestaand kotadres is niet noodzakelijk het
-- thuisadres. De jaarlijkse studiebevestiging vraagt ontbrekende adressen op.
