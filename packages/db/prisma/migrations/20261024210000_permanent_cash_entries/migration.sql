-- Vaste kassa's: het kasboek van de kassa die Cursusdienst, Theokot en Fakbar
-- het hele semester houden (meegegeven, teruggegeven, tellingen). Een nieuwe
-- tabel, dus er zijn geen bestaande rijen die een waarde moeten krijgen. Wat er
-- voor deze migratie bij de posten lag, staat in het rekenblad van Beheer; het
-- kasboek begint leeg, en de eerste regel is de startkassa die Beheer meegeeft.

-- CreateEnum
CREATE TYPE "PermanentCashEntryKind" AS ENUM ('HANDED_OUT', 'RETURNED', 'COUNT');

-- CreateTable
CREATE TABLE "PermanentCashEntry" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" "PermanentCashEntryKind" NOT NULL,
    "date" DATE NOT NULL,
    "cashCents" INTEGER NOT NULL,
    "counts" JSONB,
    "shiftVouchers" INTEGER NOT NULL DEFAULT 0,
    "elixirVouchers" INTEGER NOT NULL DEFAULT 0,
    "shiftVoucherValueCents" INTEGER NOT NULL,
    "elixirVoucherValueCents" INTEGER NOT NULL,
    "closesRegister" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PermanentCashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermanentCashEntry_groupId_date_idx" ON "PermanentCashEntry"("groupId", "date");

-- CreateIndex
CREATE INDEX "PermanentCashEntry_createdById_idx" ON "PermanentCashEntry"("createdById");

-- AddForeignKey
ALTER TABLE "PermanentCashEntry" ADD CONSTRAINT "PermanentCashEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermanentCashEntry" ADD CONSTRAINT "PermanentCashEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
