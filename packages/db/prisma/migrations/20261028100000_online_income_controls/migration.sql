-- Oriëntatie online inkomsten, fase 1b: een kanaal kan op de eigen rekening
-- van een post storten (de QR-code van Theokot), en Beheer vinkt
-- Mollie-uitbetalingen af tegen het uittreksel. Bestaande kanalen blijven
-- gedeeld (ownerGroupId NULL): dat is hoe ze tot nu toe meetelden, en welke
-- post op een eigen rekening stort, vult Beheer zelf in.

-- AlterEnum
ALTER TYPE "IncomeRule" ADD VALUE 'OWN_ACCOUNT';

-- AlterTable
ALTER TABLE "IncomeChannel" ADD COLUMN     "ownerGroupId" TEXT;

-- CreateTable
CREATE TABLE "IncomePayoutCheck" (
    "payoutReference" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedById" TEXT,

    CONSTRAINT "IncomePayoutCheck_pkey" PRIMARY KEY ("payoutReference")
);

-- AddForeignKey
ALTER TABLE "IncomeChannel" ADD CONSTRAINT "IncomeChannel_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomePayoutCheck" ADD CONSTRAINT "IncomePayoutCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

