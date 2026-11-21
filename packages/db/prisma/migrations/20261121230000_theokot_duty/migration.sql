-- Verantwoordelijken van Theokot: beschikbaarheid, indeling, afwijkende blokken
-- en de startstand van de telling. Vier nieuwe tabellen, dus geen bestaande
-- rijen die een waarde moeten krijgen. Zie docs/design-decisions.md,
-- "Theokot: verantwoordelijken".

-- CreateTable
CREATE TABLE "TheokotDutyAvailability" (
    "date" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TheokotDutyAvailability_pkey" PRIMARY KEY ("date","slot","userId")
);

-- CreateTable
CREATE TABLE "TheokotDutyAssignment" (
    "date" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TheokotDutyAssignment_pkey" PRIMARY KEY ("date","slot","userId")
);

-- CreateTable
CREATE TABLE "TheokotDutyBlock" (
    "date" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "open" BOOLEAN NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TheokotDutyBlock_pkey" PRIMARY KEY ("date","slot")
);

-- CreateTable
CREATE TABLE "TheokotDutyCarryOver" (
    "year" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TheokotDutyCarryOver_pkey" PRIMARY KEY ("year","userId")
);

-- CreateIndex
CREATE INDEX "TheokotDutyAvailability_userId_idx" ON "TheokotDutyAvailability"("userId");

-- CreateIndex
CREATE INDEX "TheokotDutyAssignment_userId_date_idx" ON "TheokotDutyAssignment"("userId", "date");

-- AddForeignKey
ALTER TABLE "TheokotDutyAvailability" ADD CONSTRAINT "TheokotDutyAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotDutyAssignment" ADD CONSTRAINT "TheokotDutyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotDutyCarryOver" ADD CONSTRAINT "TheokotDutyCarryOver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
