-- Budgetten die een post op de site opstelt in plaats van als rekenblad in
-- Drive. Een nieuwe tabel: er zijn nog geen rijen, en de budgetten in Drive
-- (BoDocument) blijven zoals ze zijn.

-- CreateEnum
CREATE TYPE "BoBudgetStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable
CREATE TABLE "BoBudget" (
    "id" TEXT NOT NULL,
    "workingYear" INTEGER NOT NULL,
    "postKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "BoBudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "targetDate" DATE,
    "content" JSONB NOT NULL,
    "incomeCents" INTEGER NOT NULL DEFAULT 0,
    "expenseCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BoBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoBudget_workingYear_postKey_idx" ON "BoBudget"("workingYear", "postKey");
