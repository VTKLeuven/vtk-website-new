-- Bijrijders met een naam en een nummer per stuk (V2).
--
-- `helpersNote` + `helpersPhone` op de rit droegen één vrije tekst en één nummer.
-- Twee bijrijders met elk hun gsm pasten daar niet in, en de chauffeur belde dan
-- de aanvrager om het tweede nummer te vragen.
CREATE TABLE "UitleenTransportHelper" (
  "id" TEXT NOT NULL,
  "transportBookingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "addedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UitleenTransportHelper_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UitleenTransportHelper_transportBookingId_idx" ON "UitleenTransportHelper"("transportBookingId");

ALTER TABLE "UitleenTransportHelper"
  ADD CONSTRAINT "UitleenTransportHelper_transportBookingId_fkey"
  FOREIGN KEY ("transportBookingId") REFERENCES "UitleenTransportBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UitleenTransportHelper"
  ADD CONSTRAINT "UitleenTransportHelper_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Wat er al ingevuld staat, wordt één bijrijder. De vrije tekst kan "twee helpers
-- van onze werkgroep" zijn en dus geen naam; dat blijft leesbaar staan als naam,
-- want hem weggooien zou informatie verliezen die de chauffeur onderweg gebruikt.
-- De twee kolommen zelf blijven bestaan voor de historiek van bestaande ritten.
INSERT INTO "UitleenTransportHelper" ("id", "transportBookingId", "name", "phone", "createdAt")
SELECT
  gen_random_uuid()::text,
  "id",
  COALESCE(NULLIF(btrim("helpersNote"), ''), 'Bijrijder'),
  NULLIF(btrim("helpersPhone"), ''),
  "createdAt"
FROM "UitleenTransportBooking"
WHERE NULLIF(btrim("helpersNote"), '') IS NOT NULL
   OR NULLIF(btrim("helpersPhone"), '') IS NOT NULL;
