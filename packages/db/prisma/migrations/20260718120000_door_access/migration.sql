-- Deurtoegang: modellen voor de KU Leuven-kaartscanner aan de deur.
-- DoorAccessGrant = tijdelijke toegang los van de rollen (venster start/eind).
-- DoorAccessLog   = één rij per deurgebeurtenis (kaartscan of remote-open), voor
--                   de statistiek en het logoverzicht in /admin/deur.

-- CreateEnum
CREATE TYPE "DoorMethod" AS ENUM ('CARD', 'REMOTE');

-- CreateEnum
CREATE TYPE "DoorLogResult" AS ENUM ('ALLOWED', 'DENIED', 'UNKNOWN_CARD', 'ERROR');

-- CreateTable
CREATE TABLE "DoorAccessGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorAccessLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "rNumber" TEXT,
    "cardName" TEXT,
    "method" "DoorMethod" NOT NULL,
    "result" "DoorLogResult" NOT NULL,
    "reason" TEXT,
    "offline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DoorAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoorAccessGrant_userId_idx" ON "DoorAccessGrant"("userId");

-- CreateIndex
CREATE INDEX "DoorAccessGrant_endsAt_idx" ON "DoorAccessGrant"("endsAt");

-- CreateIndex
CREATE INDEX "DoorAccessLog_at_idx" ON "DoorAccessLog"("at");

-- CreateIndex
CREATE INDEX "DoorAccessLog_result_idx" ON "DoorAccessLog"("result");

-- CreateIndex
CREATE INDEX "DoorAccessLog_userId_idx" ON "DoorAccessLog"("userId");

-- AddForeignKey
ALTER TABLE "DoorAccessGrant" ADD CONSTRAINT "DoorAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorAccessLog" ADD CONSTRAINT "DoorAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
