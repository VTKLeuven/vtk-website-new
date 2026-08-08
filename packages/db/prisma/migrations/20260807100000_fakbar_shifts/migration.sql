-- CreateEnum
CREATE TYPE "FakbarCashMoment" AS ENUM ('START', 'END', 'VAULT');

-- CreateEnum
CREATE TYPE "FakbarSumUpSource" AS ENUM ('MANUAL', 'API');

-- CreateTable
CREATE TABLE "FakbarCouponType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FakbarCouponType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarShift" (
    "id" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "sumUpCents" INTEGER,
    "sumUpSource" "FakbarSumUpSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FakbarShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarCashCount" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "moment" "FakbarCashMoment" NOT NULL,
    "denominationCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "FakbarCashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarShiftCoupon" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "couponTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "valueCents" INTEGER NOT NULL,

    CONSTRAINT "FakbarShiftCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FakbarShift_openedAt_idx" ON "FakbarShift"("openedAt");

-- CreateIndex
CREATE INDEX "FakbarShift_closedAt_idx" ON "FakbarShift"("closedAt");

-- CreateIndex
CREATE INDEX "FakbarCashCount_shiftId_idx" ON "FakbarCashCount"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "FakbarCashCount_shiftId_moment_denominationCents_key" ON "FakbarCashCount"("shiftId", "moment", "denominationCents");

-- CreateIndex
CREATE INDEX "FakbarShiftCoupon_shiftId_idx" ON "FakbarShiftCoupon"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "FakbarShiftCoupon_shiftId_couponTypeId_key" ON "FakbarShiftCoupon"("shiftId", "couponTypeId");

-- AddForeignKey
ALTER TABLE "FakbarShift" ADD CONSTRAINT "FakbarShift_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarShift" ADD CONSTRAINT "FakbarShift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarCashCount" ADD CONSTRAINT "FakbarCashCount_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "FakbarShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarShiftCoupon" ADD CONSTRAINT "FakbarShiftCoupon_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "FakbarShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarShiftCoupon" ADD CONSTRAINT "FakbarShiftCoupon_couponTypeId_fkey" FOREIGN KEY ("couponTypeId") REFERENCES "FakbarCouponType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

