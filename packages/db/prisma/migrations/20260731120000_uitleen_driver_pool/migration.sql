-- Chauffeurspool van de uitleendienst: mensen die Logistiek zelf toevoegt,
-- naast de leden van de post Logistiek (die automatisch chauffeur zijn). Eén rij
-- per gebruiker; verwijderen uit de pool laat toegewezen ritten ongemoeid.
CREATE TABLE "UitleenDriver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UitleenDriver_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UitleenDriver_userId_key" ON "UitleenDriver"("userId");

ALTER TABLE "UitleenDriver" ADD CONSTRAINT "UitleenDriver_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UitleenDriver" ADD CONSTRAINT "UitleenDriver_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Mijn ritten" voor een chauffeur, en de rittentelling per chauffeur.
CREATE INDEX "UitleenTransportBooking_driverId_startAt_idx" ON "UitleenTransportBooking"("driverId", "startAt");
