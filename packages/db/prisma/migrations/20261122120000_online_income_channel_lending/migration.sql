-- Een uitlening van een toestel voor een paar dagen (koppelregel 6), in plaats
-- van het eenmalige formulier "Een hele dag van een kanaal anders toewijzen".
--
-- Bestaande rijen: de tabel begint leeg, en elke transactie krijgt NULL in
-- `channelLendingId`; geen enkele werd door een uitlening gekoppeld. De dagen
-- die met het oude formulier toegewezen werden, blijven rijen met regel MANUAL
-- en hun code: welke MANUAL-rijen van dat formulier kwamen, staat enkel in de
-- auditlog. Beheer zet ze om door een uitlening voor die dagen te maken en "Neem
-- over" te kiezen (Na te kijken); de code verandert dan niet, enkel de regel.
-- Niets hier verandert een code of een maand, ook niet in een afgesloten
-- periode.
--
-- De nieuwe waarde van het enum wordt in deze migratie niet gebruikt: zo hindert
-- de beperking van Postgres op een nieuwe enumwaarde in dezelfde transactie niet.

-- AlterEnum
ALTER TYPE "IncomeRule" ADD VALUE 'CHANNEL_LENDING';

-- AlterTable
ALTER TABLE "IncomeTransaction" ADD COLUMN     "channelLendingId" TEXT;

-- CreateTable
CREATE TABLE "IncomeChannelLending" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "fromDay" DATE NOT NULL,
    "toDay" DATE NOT NULL,
    "accountingCodeId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncomeChannelLending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeChannelLending_channelId_fromDay_idx" ON "IncomeChannelLending"("channelId", "fromDay");

-- CreateIndex
CREATE INDEX "IncomeChannelLending_accountingCodeId_idx" ON "IncomeChannelLending"("accountingCodeId");

-- CreateIndex
CREATE INDEX "IncomeTransaction_channelLendingId_idx" ON "IncomeTransaction"("channelLendingId");

-- AddForeignKey
ALTER TABLE "IncomeChannelLending" ADD CONSTRAINT "IncomeChannelLending_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "IncomeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeChannelLending" ADD CONSTRAINT "IncomeChannelLending_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeChannelLending" ADD CONSTRAINT "IncomeChannelLending_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeChannelLending" ADD CONSTRAINT "IncomeChannelLending_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_channelLendingId_fkey" FOREIGN KEY ("channelLendingId") REFERENCES "IncomeChannelLending"("id") ON DELETE SET NULL ON UPDATE CASCADE;
