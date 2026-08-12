-- AlterTable
ALTER TABLE "UitleenReservationLine" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "UitleenItemAlternative" (
    "itemId" TEXT NOT NULL,
    "alternativeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UitleenItemAlternative_pkey" PRIMARY KEY ("itemId","alternativeId")
);

-- CreateIndex
CREATE INDEX "UitleenItemAlternative_alternativeId_idx" ON "UitleenItemAlternative"("alternativeId");

-- AddForeignKey
ALTER TABLE "UitleenItemAlternative" ADD CONSTRAINT "UitleenItemAlternative_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenItemAlternative" ADD CONSTRAINT "UitleenItemAlternative_alternativeId_fkey" FOREIGN KEY ("alternativeId") REFERENCES "UitleenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
