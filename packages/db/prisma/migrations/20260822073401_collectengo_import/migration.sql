-- CreateEnum
CREATE TYPE "CollectEnGoOrderStatus" AS ENUM ('NEW', 'IMPORTED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CollectEnGoUnit" AS ENUM ('PIECE', 'WEIGHT');

-- CreateTable
CREATE TABLE "CollectEnGoOrder" (
    "id" TEXT NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "messageId" TEXT,
    "source" TEXT NOT NULL,
    "status" "CollectEnGoOrderStatus" NOT NULL DEFAULT 'NEW',
    "customerName" TEXT,
    "pickupPoint" TEXT,
    "pickupFrom" TIMESTAMPTZ(3),
    "pickupUntil" TIMESTAMPTZ(3),
    "orderedAt" TIMESTAMPTZ(3),
    "subtotalCents" INTEGER,
    "discountCents" INTEGER,
    "serviceCostCents" INTEGER,
    "totalCents" INTEGER,
    "rawText" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMPTZ(3),
    "importedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectEnGoOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectEnGoOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL,
    "category" TEXT,
    "productName" TEXT NOT NULL,
    "note" TEXT,
    "unit" "CollectEnGoUnit" NOT NULL DEFAULT 'PIECE',
    "quantity" INTEGER NOT NULL,
    "quantityText" TEXT,
    "unitPriceCents" INTEGER,
    "unitPriceBasis" TEXT,
    "totalPriceCents" INTEGER,
    "depositCents" INTEGER,
    "lineDiscountCents" INTEGER,
    "flesserkeItemId" TEXT,
    "importedQuantity" INTEGER,

    CONSTRAINT "CollectEnGoOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectEnGoProductMatch" (
    "id" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "flesserkeItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectEnGoProductMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectEnGoOrder_messageId_key" ON "CollectEnGoOrder"("messageId");

-- CreateIndex
CREATE INDEX "CollectEnGoOrder_status_receivedAt_idx" ON "CollectEnGoOrder"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "CollectEnGoOrder_reservationNumber_idx" ON "CollectEnGoOrder"("reservationNumber");

-- CreateIndex
CREATE INDEX "CollectEnGoOrderLine_orderId_sortIndex_idx" ON "CollectEnGoOrderLine"("orderId", "sortIndex");

-- CreateIndex
CREATE INDEX "CollectEnGoOrderLine_flesserkeItemId_idx" ON "CollectEnGoOrderLine"("flesserkeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectEnGoProductMatch_productKey_key" ON "CollectEnGoProductMatch"("productKey");

-- CreateIndex
CREATE INDEX "CollectEnGoProductMatch_flesserkeItemId_idx" ON "CollectEnGoProductMatch"("flesserkeItemId");

-- AddForeignKey
ALTER TABLE "CollectEnGoOrder" ADD CONSTRAINT "CollectEnGoOrder_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectEnGoOrderLine" ADD CONSTRAINT "CollectEnGoOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CollectEnGoOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectEnGoOrderLine" ADD CONSTRAINT "CollectEnGoOrderLine_flesserkeItemId_fkey" FOREIGN KEY ("flesserkeItemId") REFERENCES "UitleenFlesserkeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectEnGoProductMatch" ADD CONSTRAINT "CollectEnGoProductMatch_flesserkeItemId_fkey" FOREIGN KEY ("flesserkeItemId") REFERENCES "UitleenFlesserkeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
