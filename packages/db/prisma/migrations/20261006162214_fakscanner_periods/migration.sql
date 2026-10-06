-- Periodes voor de fakscanner: tijdens een groot evenement telt de scanner per
-- tijdvak (standaard elk uur) binnen een dagelijks venster, in een eigen teller.
-- Twee nieuwe tabellen, dus nul rijen: de gewone stand in "FakTally" en alle
-- bestaande check-ins blijven zoals ze zijn.

-- CreateTable
CREATE TABLE "FakPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "rewardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardEvery" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FakPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakPeriodTally" (
    "periodId" TEXT NOT NULL,
    "rNumber" TEXT NOT NULL,
    "checkins" INTEGER NOT NULL DEFAULT 0,
    "lastCheckinAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FakPeriodTally_pkey" PRIMARY KEY ("periodId","rNumber")
);

-- CreateIndex
CREATE INDEX "FakPeriod_startsAt_endsAt_idx" ON "FakPeriod"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "FakPeriodTally_periodId_checkins_idx" ON "FakPeriodTally"("periodId", "checkins");

-- AddForeignKey
ALTER TABLE "FakPeriodTally" ADD CONSTRAINT "FakPeriodTally_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FakPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
