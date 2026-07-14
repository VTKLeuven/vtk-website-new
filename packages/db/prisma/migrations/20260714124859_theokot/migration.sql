-- CreateEnum
CREATE TYPE "TheokotOrderStatus" AS ENUM ('RESERVED', 'PICKED_UP', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "TheokotProduct" (
    "id" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT,
    "priceCents" INTEGER NOT NULL,
    "defaultQuantity" INTEGER NOT NULL DEFAULT 0,
    "isWeeklySpecialSlot" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TheokotProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotSession" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "orderOpenAt" TIMESTAMP(3) NOT NULL,
    "orderCloseAt" TIMESTAMP(3) NOT NULL,
    "pickupStart" TIMESTAMP(3) NOT NULL,
    "pickupEnd" TIMESTAMP(3) NOT NULL,
    "weeklySpecialLabelNl" TEXT,
    "weeklySpecialLabelEn" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TheokotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT,
    "priceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "isWeeklySpecial" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TheokotSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotOrder" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TheokotOrderStatus" NOT NULL DEFAULT 'RESERVED',
    "totalCents" INTEGER NOT NULL,
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pickedUpAt" TIMESTAMP(3),
    "pickedUpById" TEXT,

    CONSTRAINT "TheokotOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,

    CONSTRAINT "TheokotOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotBan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TheokotBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TheokotSession_date_key" ON "TheokotSession"("date");

-- CreateIndex
CREATE INDEX "TheokotSession_date_idx" ON "TheokotSession"("date");

-- CreateIndex
CREATE INDEX "TheokotSessionItem_sessionId_idx" ON "TheokotSessionItem"("sessionId");

-- CreateIndex
CREATE INDEX "TheokotOrder_userId_idx" ON "TheokotOrder"("userId");

-- CreateIndex
CREATE INDEX "TheokotOrder_status_idx" ON "TheokotOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TheokotOrder_sessionId_userId_key" ON "TheokotOrder"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "TheokotOrderLine_orderId_idx" ON "TheokotOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "TheokotOrderLine_sessionItemId_idx" ON "TheokotOrderLine"("sessionItemId");

-- CreateIndex
CREATE INDEX "TheokotBan_userId_idx" ON "TheokotBan"("userId");

-- CreateIndex
CREATE INDEX "TheokotBan_active_idx" ON "TheokotBan"("active");

-- AddForeignKey
ALTER TABLE "TheokotSessionItem" ADD CONSTRAINT "TheokotSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TheokotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotOrder" ADD CONSTRAINT "TheokotOrder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TheokotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotOrder" ADD CONSTRAINT "TheokotOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotOrder" ADD CONSTRAINT "TheokotOrder_pickedUpById_fkey" FOREIGN KEY ("pickedUpById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotOrderLine" ADD CONSTRAINT "TheokotOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TheokotOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotOrderLine" ADD CONSTRAINT "TheokotOrderLine_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "TheokotSessionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotBan" ADD CONSTRAINT "TheokotBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
