-- CreateEnum
CREATE TYPE "UitleenReservationStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PICKED_UP', 'RETURNED');

-- CreateEnum
CREATE TYPE "UitleenVanBookingStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UitleenPaymentMode" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "UitleenPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "UitleenCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "photoKey" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UitleenReservationStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickupDate" DATE NOT NULL,
    "returnDate" DATE NOT NULL,
    "memberNote" TEXT,
    "adminNote" TEXT,
    "totalPriceCents" INTEGER NOT NULL,
    "totalDepositCents" INTEGER NOT NULL,
    "paymentMode" "UitleenPaymentMode",
    "paidOfflineAt" TIMESTAMP(3),
    "depositReturnedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "pickedUpById" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenReservationLine" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "unitDepositCents" INTEGER NOT NULL,

    CONSTRAINT "UitleenReservationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenVanBooking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UitleenVanBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "pickupAddress" TEXT,
    "destination" TEXT,
    "driverId" TEXT,
    "hourlyRateCents" INTEGER NOT NULL DEFAULT 750,
    "priceCents" INTEGER NOT NULL,
    "paymentMode" "UitleenPaymentMode",
    "paidOfflineAt" TIMESTAMP(3),
    "memberNote" TEXT,
    "adminNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenVanBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenPayment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "vanBookingId" TEXT,
    "provider" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerPaymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "UitleenPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "checkoutUrl" TEXT,
    "providerStatus" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "succeededAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UitleenPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenPaymentWebhook" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "paymentId" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,

    CONSTRAINT "UitleenPaymentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenItem_categoryId_active_idx" ON "UitleenItem"("categoryId", "active");

-- CreateIndex
CREATE INDEX "UitleenReservation_userId_idx" ON "UitleenReservation"("userId");

-- CreateIndex
CREATE INDEX "UitleenReservation_status_pickupDate_idx" ON "UitleenReservation"("status", "pickupDate");

-- CreateIndex
CREATE INDEX "UitleenReservation_pickupDate_returnDate_idx" ON "UitleenReservation"("pickupDate", "returnDate");

-- CreateIndex
CREATE INDEX "UitleenReservationLine_reservationId_idx" ON "UitleenReservationLine"("reservationId");

-- CreateIndex
CREATE INDEX "UitleenReservationLine_itemId_idx" ON "UitleenReservationLine"("itemId");

-- CreateIndex
CREATE INDEX "UitleenVanBooking_userId_idx" ON "UitleenVanBooking"("userId");

-- CreateIndex
CREATE INDEX "UitleenVanBooking_status_startAt_idx" ON "UitleenVanBooking"("status", "startAt");

-- CreateIndex
CREATE INDEX "UitleenVanBooking_startAt_endAt_idx" ON "UitleenVanBooking"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "UitleenPayment_reservationId_status_idx" ON "UitleenPayment"("reservationId", "status");

-- CreateIndex
CREATE INDEX "UitleenPayment_vanBookingId_status_idx" ON "UitleenPayment"("vanBookingId", "status");

-- CreateIndex
CREATE INDEX "UitleenPayment_status_expiresAt_idx" ON "UitleenPayment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UitleenPayment_provider_providerCheckoutId_key" ON "UitleenPayment"("provider", "providerCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "UitleenPayment_provider_providerPaymentId_key" ON "UitleenPayment"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "UitleenPayment_provider_idempotencyKey_key" ON "UitleenPayment"("provider", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UitleenPaymentWebhook_paymentId_idx" ON "UitleenPaymentWebhook"("paymentId");

-- CreateIndex
CREATE INDEX "UitleenPaymentWebhook_processedAt_receivedAt_idx" ON "UitleenPaymentWebhook"("processedAt", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UitleenPaymentWebhook_provider_externalEventId_key" ON "UitleenPaymentWebhook"("provider", "externalEventId");

-- AddForeignKey
ALTER TABLE "UitleenItem" ADD CONSTRAINT "UitleenItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UitleenCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservation" ADD CONSTRAINT "UitleenReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservation" ADD CONSTRAINT "UitleenReservation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservation" ADD CONSTRAINT "UitleenReservation_pickedUpById_fkey" FOREIGN KEY ("pickedUpById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservation" ADD CONSTRAINT "UitleenReservation_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservationLine" ADD CONSTRAINT "UitleenReservationLine_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "UitleenReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenReservationLine" ADD CONSTRAINT "UitleenReservationLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenVanBooking" ADD CONSTRAINT "UitleenVanBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenVanBooking" ADD CONSTRAINT "UitleenVanBooking_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenVanBooking" ADD CONSTRAINT "UitleenVanBooking_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenPayment" ADD CONSTRAINT "UitleenPayment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "UitleenReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenPayment" ADD CONSTRAINT "UitleenPayment_vanBookingId_fkey" FOREIGN KEY ("vanBookingId") REFERENCES "UitleenVanBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenPaymentWebhook" ADD CONSTRAINT "UitleenPaymentWebhook_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "UitleenPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
