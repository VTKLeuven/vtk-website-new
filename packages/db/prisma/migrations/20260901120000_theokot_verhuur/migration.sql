-- CreateEnum
CREATE TYPE "TheokotRentalStatus" AS ENUM ('UNANSWERED', 'REJECTED', 'APPROVED', 'CANCELLED', 'ENDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TheokotRentalDepositChoice" AS ENUM ('TRANSFER', 'CASH', 'NVT');

-- CreateEnum
CREATE TYPE "TheokotDepositState" AS ENUM ('NVT', 'TRANSFER', 'CASH', 'TRANSFER_IN', 'CASH_IN', 'TRANSFER_BACK', 'CASH_BACK', 'PROBLEM');

-- CreateEnum
CREATE TYPE "TheokotContractState" AS ENUM ('PENDING', 'SIGNED', 'NVT');

-- CreateEnum
CREATE TYPE "TheokotKeyState" AS ENUM ('PENDING', 'GIVEN', 'RETURNED', 'NVT');

-- CreateEnum
CREATE TYPE "TheokotRenterType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TheokotRentalDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "TheokotRental" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'nl',
    "responsibleName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "attendees" INTEGER,
    "remarks" TEXT,
    "depositChoice" "TheokotRentalDepositChoice" NOT NULL DEFAULT 'NVT',
    "extraAnswers" JSONB NOT NULL DEFAULT '{}',
    "renterType" "TheokotRenterType" NOT NULL DEFAULT 'EXTERNAL',
    "status" "TheokotRentalStatus" NOT NULL DEFAULT 'UNANSWERED',
    "deposit" "TheokotDepositState" NOT NULL DEFAULT 'NVT',
    "contract" "TheokotContractState" NOT NULL DEFAULT 'PENDING',
    "keyStatus" "TheokotKeyState" NOT NULL DEFAULT 'PENDING',
    "internalNote" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" TEXT,
    "decidedViaMail" BOOLEAN NOT NULL DEFAULT false,
    "requesterNotifiedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TheokotRental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotRentalMessage" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "templateId" TEXT,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentName" TEXT,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,
    "sentViaMail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TheokotRentalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotRentalActionToken" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "action" "TheokotRentalDecision" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TheokotRentalActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotRentalContractDoc" (
    "id" TEXT NOT NULL,
    "audience" "TheokotRenterType" NOT NULL,
    "locale" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TheokotRentalContractDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TheokotRental_startsAt_idx" ON "TheokotRental"("startsAt");

-- CreateIndex
CREATE INDEX "TheokotRental_status_startsAt_idx" ON "TheokotRental"("status", "startsAt");

-- CreateIndex
CREATE INDEX "TheokotRental_email_idx" ON "TheokotRental"("email");

-- CreateIndex
CREATE INDEX "TheokotRentalMessage_rentalId_sentAt_idx" ON "TheokotRentalMessage"("rentalId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "TheokotRentalActionToken_tokenHash_key" ON "TheokotRentalActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TheokotRentalActionToken_rentalId_idx" ON "TheokotRentalActionToken"("rentalId");

-- CreateIndex
CREATE INDEX "TheokotRentalActionToken_expiresAt_idx" ON "TheokotRentalActionToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TheokotRentalContractDoc_audience_locale_key" ON "TheokotRentalContractDoc"("audience", "locale");

-- AddForeignKey
ALTER TABLE "TheokotRental" ADD CONSTRAINT "TheokotRental_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotRental" ADD CONSTRAINT "TheokotRental_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotRentalMessage" ADD CONSTRAINT "TheokotRentalMessage_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "TheokotRental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotRentalMessage" ADD CONSTRAINT "TheokotRentalMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotRentalActionToken" ADD CONSTRAINT "TheokotRentalActionToken_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "TheokotRental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotRentalContractDoc" ADD CONSTRAINT "TheokotRentalContractDoc_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

