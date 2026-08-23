-- CreateTable
CREATE TABLE "UitleenEventExtraItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "UitleenEventExtraItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenEventExtraItem_eventId_idx" ON "UitleenEventExtraItem"("eventId");

-- AddForeignKey
ALTER TABLE "UitleenEventExtraItem" ADD CONSTRAINT "UitleenEventExtraItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UitleenEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenEventExtraItem" ADD CONSTRAINT "UitleenEventExtraItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CollectEnGoOrder" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE INDEX "CollectEnGoOrder_eventId_idx" ON "CollectEnGoOrder"("eventId");

-- AddForeignKey
ALTER TABLE "CollectEnGoOrder" ADD CONSTRAINT "CollectEnGoOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UitleenEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
