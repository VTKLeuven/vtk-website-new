-- CreateEnum
CREATE TYPE "MembershipKind" AS ENUM ('FACULTY', 'EXTERNAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "MembershipPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" "MembershipKind" NOT NULL,
    "activatedAt" TIMESTAMPTZ(3),
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "grantedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPayment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerPaymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "MembershipPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "checkoutUrl" TEXT,
    "providerStatus" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "succeededAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MembershipPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPaymentWebhook" (
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

    CONSTRAINT "MembershipPaymentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_year_activatedAt_idx" ON "Membership"("year", "activatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_year_key" ON "Membership"("userId", "year");

-- CreateIndex
CREATE INDEX "MembershipPayment_membershipId_status_idx" ON "MembershipPayment"("membershipId", "status");

-- CreateIndex
CREATE INDEX "MembershipPayment_status_expiresAt_idx" ON "MembershipPayment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPayment_provider_providerCheckoutId_key" ON "MembershipPayment"("provider", "providerCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPayment_provider_providerPaymentId_key" ON "MembershipPayment"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPayment_provider_idempotencyKey_key" ON "MembershipPayment"("provider", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MembershipPaymentWebhook_paymentId_idx" ON "MembershipPaymentWebhook"("paymentId");

-- CreateIndex
CREATE INDEX "MembershipPaymentWebhook_processedAt_receivedAt_idx" ON "MembershipPaymentWebhook"("processedAt", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPaymentWebhook_provider_externalEventId_key" ON "MembershipPaymentWebhook"("provider", "externalEventId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPaymentWebhook" ADD CONSTRAINT "MembershipPaymentWebhook_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "MembershipPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

