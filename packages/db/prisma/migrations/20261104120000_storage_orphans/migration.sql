-- Objecten in de bucket zonder verwijzing in de database (lib/storage-cleanup.ts).
-- Nieuwe tabel, dus nul rijen: de eerste nachtelijke scan vult ze, en elk object
-- begint dan zijn wachttijd van 30 dagen op de dag van die scan.
CREATE TABLE "StorageOrphan" (
    "key" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageOrphan_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "StorageOrphan_firstSeenAt_idx" ON "StorageOrphan"("firstSeenAt");
