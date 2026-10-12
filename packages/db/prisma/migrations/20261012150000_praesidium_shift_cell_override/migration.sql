-- Een keuze per vakje op een shiftenlijst van het praesidium: telt niet mee,
-- of telt voor iemand anders dan de naam zegt. Nieuwe tabel: bestaande lijsten
-- krijgen geen rijen, dus elk vakje telt zoals voorheen voor wie zijn naam is.

-- CreateTable
CREATE TABLE "PraesidiumShiftCellOverride" (
    "listId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "cell" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT,
    "slot" TEXT,
    "date" DATE,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PraesidiumShiftCellOverride_pkey" PRIMARY KEY ("listId","sheet","cell","nameKey")
);

-- CreateIndex
CREATE INDEX "PraesidiumShiftCellOverride_userId_idx" ON "PraesidiumShiftCellOverride"("userId");

-- AddForeignKey
ALTER TABLE "PraesidiumShiftCellOverride" ADD CONSTRAINT "PraesidiumShiftCellOverride_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PraesidiumShiftList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftCellOverride" ADD CONSTRAINT "PraesidiumShiftCellOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftCellOverride" ADD CONSTRAINT "PraesidiumShiftCellOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
