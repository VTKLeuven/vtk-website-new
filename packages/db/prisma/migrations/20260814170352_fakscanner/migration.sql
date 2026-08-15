-- CreateEnum
CREATE TYPE "FakScanResult" AS ENUM ('COUNTED', 'ALREADY_TODAY', 'UNKNOWN_CARD', 'ERROR');

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
CREATE TABLE "FakCheckin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points" INTEGER NOT NULL DEFAULT 1,
    "double" BOOLEAN NOT NULL DEFAULT false,
    "reward" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FakCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakScanLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "FakScanResult" NOT NULL,
    "userId" TEXT,
    "rNumber" TEXT,
    "cardName" TEXT,
    "points" INTEGER,
    "total" INTEGER,
    "reward" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,

    CONSTRAINT "FakScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentCard_rNumber_idx" ON "StudentCard"("rNumber");

-- CreateIndex
CREATE INDEX "FakCheckin_year_userId_idx" ON "FakCheckin"("year", "userId");

-- CreateIndex
CREATE INDEX "FakCheckin_at_idx" ON "FakCheckin"("at");

-- CreateIndex
CREATE UNIQUE INDEX "FakCheckin_userId_day_key" ON "FakCheckin"("userId", "day");

-- CreateIndex
CREATE INDEX "FakScanLog_at_idx" ON "FakScanLog"("at");

-- CreateIndex
CREATE INDEX "FakScanLog_result_idx" ON "FakScanLog"("result");

-- CreateIndex
CREATE INDEX "FakScanLog_userId_idx" ON "FakScanLog"("userId");

-- AddForeignKey
ALTER TABLE "FakCheckin" ADD CONSTRAINT "FakCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakScanLog" ADD CONSTRAINT "FakScanLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
