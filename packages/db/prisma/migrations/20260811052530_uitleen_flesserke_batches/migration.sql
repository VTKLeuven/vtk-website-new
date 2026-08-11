-- CreateTable
CREATE TABLE "UitleenFlesserkeBatch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "expiryDate" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenFlesserkeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenFlesserkeBatch_itemId_expiryDate_idx" ON "UitleenFlesserkeBatch"("itemId", "expiryDate");

-- AddForeignKey
ALTER TABLE "UitleenFlesserkeBatch" ADD CONSTRAINT "UitleenFlesserkeBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenFlesserkeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bestaande voorraad wordt één lading per item, met de datum die er nu op staat.
-- Zonder deze stap zouden alle items op nul komen te staan zodra de app de som
-- van de batches als voorraad neemt.
INSERT INTO "UitleenFlesserkeBatch" ("id", "itemId", "quantity", "expiryDate", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "quantity", "expiryDate", NOW(), NOW()
FROM "UitleenFlesserkeItem";
