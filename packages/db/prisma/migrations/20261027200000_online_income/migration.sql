-- Oriëntatie online inkomsten (fase 1): opgeladen exports van Payconiq en
-- Mollie, hun transacties met een boekhoudcode, de kanalen die Beheer zelf
-- instelt, onthouden teksten en afgesloten periodes. Nieuwe tabellen: er
-- verandert niets aan bestaande rijen. Het recht income.manage maakt de sync
-- bij de start aan en hangt het aan de rol admin.


-- CreateEnum
CREATE TYPE "IncomeSource" AS ENUM ('PAYCONIQ', 'MOLLIE');

-- CreateEnum
CREATE TYPE "IncomeKind" AS ENUM ('PAYMENT', 'REFUND', 'FEE', 'RESERVE');

-- CreateEnum
CREATE TYPE "IncomeRule" AS ENUM ('MANUAL', 'WEBSITE', 'CODE_IN_TEXT', 'NAME_RULE');

-- CreateTable
CREATE TABLE "IncomeImport" (
    "id" TEXT NOT NULL,
    "source" "IncomeSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "lockedCount" INTEGER NOT NULL DEFAULT 0,
    "firstAt" TIMESTAMPTZ(3),
    "lastAt" TIMESTAMPTZ(3),
    "importedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeChannel" (
    "id" TEXT NOT NULL,
    "source" "IncomeSource" NOT NULL,
    "identifier" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncomeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeChannelAccount" (
    "channelId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "bankAccount" TEXT NOT NULL,

    CONSTRAINT "IncomeChannelAccount_pkey" PRIMARY KEY ("channelId","from")
);

-- CreateTable
CREATE TABLE "IncomeTransaction" (
    "id" TEXT NOT NULL,
    "source" "IncomeSource" NOT NULL,
    "kind" "IncomeKind" NOT NULL,
    "externalKey" TEXT NOT NULL,
    "providerId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "periodMonth" DATE,
    "amountCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "reference" TEXT,
    "bulkId" TEXT,
    "payoutReference" TEXT,
    "channelId" TEXT,
    "importId" TEXT NOT NULL,
    "accountingCode" TEXT,
    "accountingCodeName" TEXT,
    "rule" "IncomeRule",
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "ticketPaymentId" TEXT,
    "membershipPaymentId" TEXT,
    "uitleenPaymentId" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncomeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeNameRule" (
    "id" TEXT NOT NULL,
    "source" "IncomeSource" NOT NULL,
    "text" TEXT NOT NULL,
    "accountingCodeId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeNameRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomePeriod" (
    "id" TEXT NOT NULL,
    "fromMonth" DATE NOT NULL,
    "toMonth" DATE NOT NULL,
    "closedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,

    CONSTRAINT "IncomePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeImport_createdAt_idx" ON "IncomeImport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeChannel_source_identifier_key" ON "IncomeChannel"("source", "identifier");

-- CreateIndex
CREATE INDEX "IncomeTransaction_periodMonth_idx" ON "IncomeTransaction"("periodMonth");

-- CreateIndex
CREATE INDEX "IncomeTransaction_importId_idx" ON "IncomeTransaction"("importId");

-- CreateIndex
CREATE INDEX "IncomeTransaction_channelId_idx" ON "IncomeTransaction"("channelId");

-- CreateIndex
CREATE INDEX "IncomeTransaction_rule_idx" ON "IncomeTransaction"("rule");

-- CreateIndex
CREATE INDEX "IncomeTransaction_ticketPaymentId_idx" ON "IncomeTransaction"("ticketPaymentId");

-- CreateIndex
CREATE INDEX "IncomeTransaction_membershipPaymentId_idx" ON "IncomeTransaction"("membershipPaymentId");

-- CreateIndex
CREATE INDEX "IncomeTransaction_uitleenPaymentId_idx" ON "IncomeTransaction"("uitleenPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeTransaction_source_externalKey_key" ON "IncomeTransaction"("source", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeNameRule_source_text_key" ON "IncomeNameRule"("source", "text");

-- CreateIndex
CREATE INDEX "IncomePeriod_fromMonth_toMonth_idx" ON "IncomePeriod"("fromMonth", "toMonth");

-- AddForeignKey
ALTER TABLE "IncomeImport" ADD CONSTRAINT "IncomeImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeChannelAccount" ADD CONSTRAINT "IncomeChannelAccount_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "IncomeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "IncomeChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "IncomeImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_ticketPaymentId_fkey" FOREIGN KEY ("ticketPaymentId") REFERENCES "TicketPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_membershipPaymentId_fkey" FOREIGN KEY ("membershipPaymentId") REFERENCES "MembershipPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_uitleenPaymentId_fkey" FOREIGN KEY ("uitleenPaymentId") REFERENCES "UitleenPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeNameRule" ADD CONSTRAINT "IncomeNameRule_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeNameRule" ADD CONSTRAINT "IncomeNameRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomePeriod" ADD CONSTRAINT "IncomePeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

