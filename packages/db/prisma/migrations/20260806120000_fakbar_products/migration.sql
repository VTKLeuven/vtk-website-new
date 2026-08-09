-- CreateEnum
CREATE TYPE "FakbarProductCategory" AS ENUM ('VATEN', 'BIEREN', 'WIJNEN', 'FRISDRANK', 'STERKE_DRANK');

-- CreateTable
CREATE TABLE "FakbarProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FakbarProductCategory" NOT NULL,
    "purchaseUnitCents" INTEGER NOT NULL,
    "servingsPerUnit" INTEGER NOT NULL,
    "salePriceCents" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FakbarProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FakbarProduct_category_order_idx" ON "FakbarProduct"("category", "order");
