-- Oriëntatie online inkomsten, fase 2: de code van een kassa en koppelregel 4.
-- Beheer kiest de code van een kassa bij het aanvaarden. Bestaande kassa's
-- hebben er nog geen (NULL), en een kassa zonder code koppelt niets: wat op
-- haar toestel binnenkwam, blijft zoals het was tot Beheer een code kiest.
-- Bestaande transacties hangen aan geen kassa (NULL); de koppelregels lopen
-- opnieuw zodra een kassa een code krijgt.

-- AlterEnum
ALTER TYPE "IncomeRule" ADD VALUE 'CASH_REGISTER';

-- AlterTable
ALTER TABLE "CashRegister" ADD COLUMN     "accountingCodeId" TEXT;

-- AlterTable
ALTER TABLE "IncomeTransaction" ADD COLUMN     "cashRegisterId" TEXT;

-- CreateIndex
CREATE INDEX "CashRegister_accountingCodeId_idx" ON "CashRegister"("accountingCodeId");

-- CreateIndex
CREATE INDEX "IncomeTransaction_cashRegisterId_idx" ON "IncomeTransaction"("cashRegisterId");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
