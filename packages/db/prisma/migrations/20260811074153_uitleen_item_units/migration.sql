-- CreateTable
CREATE TABLE "UitleenItemUnit" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "condition" "UitleenItemCondition" NOT NULL DEFAULT 'WERKT',
    "conditionNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenItemUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenItemUnit_itemId_sortIndex_idx" ON "UitleenItemUnit"("itemId", "sortIndex");

-- AddForeignKey
ALTER TABLE "UitleenItemUnit" ADD CONSTRAINT "UitleenItemUnit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
