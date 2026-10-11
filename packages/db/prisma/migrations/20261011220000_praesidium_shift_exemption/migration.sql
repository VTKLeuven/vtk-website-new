-- Iemand overslaan op één shiftenlijst van het praesidium (logistiek die op
-- 24UL als logistiek werkt). Nieuwe tabel: bestaande lijsten krijgen geen
-- rijen, dus wie erop stond, telt mee zoals voorheen.

-- CreateTable
CREATE TABLE "PraesidiumShiftExemption" (
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PraesidiumShiftExemption_pkey" PRIMARY KEY ("listId","userId")
);

-- CreateIndex
CREATE INDEX "PraesidiumShiftExemption_userId_idx" ON "PraesidiumShiftExemption"("userId");

-- AddForeignKey
ALTER TABLE "PraesidiumShiftExemption" ADD CONSTRAINT "PraesidiumShiftExemption_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PraesidiumShiftList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftExemption" ADD CONSTRAINT "PraesidiumShiftExemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftExemption" ADD CONSTRAINT "PraesidiumShiftExemption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

