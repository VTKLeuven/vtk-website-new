-- De functies van de g5 van een kiesploeg (praeses, vice, secretaris, beheer),
-- de post "Ploeg" bij de rekeningen, en het kasboek van Beheer.
--
-- Bestaande rijen: een kiesploeglid krijgt geen functie (NULL; die was nooit
-- gevraagd, dus "geen functie"), een bestaande rekening hangt aan geen
-- kiesploeg (NULL; er bestond geen post Ploeg). Het kasboek is een nieuwe
-- tabel zonder rijen. Zie docs/design-decisions.md.

-- CreateEnum
CREATE TYPE "KiesploegFunction" AS ENUM ('PRAESES', 'VICE', 'SECRETARIS', 'BEHEER');

-- CreateEnum
CREATE TYPE "CashBookKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'PURCHASE');

-- AlterTable
ALTER TABLE "KiesploegMember" ADD COLUMN     "function" "KiesploegFunction";

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "kiesploegId" TEXT;

-- CreateTable
CREATE TABLE "CashBookEntry" (
    "id" TEXT NOT NULL,
    "kind" "CashBookKind" NOT NULL,
    "date" DATE NOT NULL,
    "workingYear" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "invoiceKey" TEXT,
    "invoiceName" TEXT,
    "invoiceMime" TEXT,
    "invoiceSize" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CashBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashBookEntry_workingYear_date_idx" ON "CashBookEntry"("workingYear", "date");

-- CreateIndex
CREATE INDEX "CashBookEntry_createdById_idx" ON "CashBookEntry"("createdById");

-- CreateIndex
CREATE INDEX "Expense_kiesploegId_idx" ON "Expense"("kiesploegId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_kiesploegId_fkey" FOREIGN KEY ("kiesploegId") REFERENCES "Kiesploeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBookEntry" ADD CONSTRAINT "CashBookEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

