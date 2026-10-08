-- Laat annuleren bij het Theokot: na de deadline worden de broodjes al
-- gemaakt, dus een annulatie wist de bestelling niet meer maar geeft haar
-- broodjes vrij. Die staan apart (`TheokotOrderRelease`), als voorraad die
-- iedereen kan overnemen, en hangen aan de bestelling van wie ze vrijgaf; wat
-- bij het sluiten van de afhaal overblijft, telt voor die persoon als no-show.
--
-- Bestaande bestellingen: geen rijen in de nieuwe tabel en `releaseNoShowAt`
-- NULL, dus niets vrijgegeven en niets verandert aan hun no-shows. Dat klopt:
-- vrijgeven bestond nog niet.
--
-- `takenOverAt` is NULL voor elke bestaande bestelling: niets werd ooit
-- overgenomen, dus `linkGrocomeetOrders` behandelt ze zoals voorheen.

-- AlterTable
ALTER TABLE "TheokotOrder" ADD COLUMN     "releaseNoShowAt" TIMESTAMPTZ(3),
ADD COLUMN     "takenOverAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "TheokotOrderRelease" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "releasedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TheokotOrderRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TheokotOrderRelease_sessionItemId_releasedAt_idx" ON "TheokotOrderRelease"("sessionItemId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TheokotOrderRelease_orderId_sessionItemId_key" ON "TheokotOrderRelease"("orderId", "sessionItemId");

-- AddForeignKey
ALTER TABLE "TheokotOrderRelease" ADD CONSTRAINT "TheokotOrderRelease_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TheokotOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotOrderRelease" ADD CONSTRAINT "TheokotOrderRelease_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "TheokotSessionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

