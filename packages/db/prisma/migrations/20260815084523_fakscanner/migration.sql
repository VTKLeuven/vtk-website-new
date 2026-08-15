-- CreateEnum
CREATE TYPE "FakScanResult" AS ENUM ('CARD_ERROR', 'SERVER_ERROR');

-- CreateTable
CREATE TABLE "StudentCard" (
    "serial" TEXT NOT NULL,
    "cardAppId" TEXT NOT NULL,
    "rNumber" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCard_pkey" PRIMARY KEY ("serial","cardAppId")
);

-- CreateTable
CREATE TABLE "FakTally" (
    "rNumber" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "checkins" INTEGER NOT NULL DEFAULT 0,
    "lastCheckinAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FakTally_pkey" PRIMARY KEY ("rNumber","year")
);

-- CreateTable
CREATE TABLE "FakScanLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "FakScanResult" NOT NULL,
    "rNumber" TEXT,
    "reason" TEXT,

    CONSTRAINT "FakScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentCard_rNumber_idx" ON "StudentCard"("rNumber");

-- CreateIndex
CREATE INDEX "FakTally_year_points_idx" ON "FakTally"("year", "points");

-- CreateIndex
CREATE INDEX "FakScanLog_at_idx" ON "FakScanLog"("at");
