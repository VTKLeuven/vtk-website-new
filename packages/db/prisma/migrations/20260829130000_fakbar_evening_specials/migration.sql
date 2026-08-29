-- CreateEnum
CREATE TYPE "FakbarSpecialKind" AS ENUM ('DRANK', 'ACTIE');

-- CreateTable
CREATE TABLE "FakbarEveningSpecial" (
    "id" TEXT NOT NULL,
    "eveningId" TEXT NOT NULL,
    "kind" "FakbarSpecialKind" NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "itemId" TEXT,
    "price" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarEveningSpecial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FakbarEveningSpecial_eveningId_idx" ON "FakbarEveningSpecial"("eveningId");

-- AddForeignKey
ALTER TABLE "FakbarEveningSpecial" ADD CONSTRAINT "FakbarEveningSpecial_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "FakbarEvening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarEveningSpecial" ADD CONSTRAINT "FakbarEveningSpecial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FakbarItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

