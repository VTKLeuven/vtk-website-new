-- Rekeningen: de opvolger van billsheet. Een lid koopt iets voor VTK, dient het
-- bonnetje in, en Groep 5 betaalt terug en stuurt het blad naar de boekhouder.
-- De drie datums (paidAt, sentAt, bookedAt) zijn samen de status; er is bewust
-- geen aparte statuskolom die daarvan zou kunnen afwijken.

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('VTK_CARD', 'PERSONAL');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "workingYear" INTEGER NOT NULL,
    "groupId" TEXT,
    "postLabel" TEXT NOT NULL,
    "submittedById" TEXT,
    "payerName" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "spentOn" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL,
    "iban" TEXT,
    "receiptKey" TEXT NOT NULL,
    "receiptName" TEXT NOT NULL,
    "receiptMime" TEXT NOT NULL,
    "receiptSize" INTEGER NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "paidById" TEXT,
    "bookedAt" TIMESTAMPTZ(3),
    "bookedById" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "sentTo" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_workingYear_idx" ON "Expense"("workingYear");

-- CreateIndex
CREATE INDEX "Expense_groupId_idx" ON "Expense"("groupId");

-- CreateIndex
CREATE INDEX "Expense_submittedById_idx" ON "Expense"("submittedById");

-- CreateIndex
CREATE INDEX "Expense_spentOn_idx" ON "Expense"("spentOn");

-- CreateIndex
CREATE INDEX "Expense_paidAt_idx" ON "Expense"("paidAt");

-- CreateIndex
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");

-- AddForeignKey
-- SetNull en niet Cascade: een verwijderde post of een uitgeschreven lid mag de
-- boekhouding niet meenemen.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
