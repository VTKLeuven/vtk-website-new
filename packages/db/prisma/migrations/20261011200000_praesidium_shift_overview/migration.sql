-- Shiftenoverzicht praesidium (/admin/shiftenoverzicht): de opgeladen
-- shiftenlijsten van de grote evenementen en de wekelijkse praesidiumshiften,
-- de koppeling van hun namen aan praesidiumleden, de onthouden bijnamen, en
-- welke shiften op /shift een praesidiumlid uit noodzaak opnam.
--
-- Enkel nieuwe tabellen: geen bestaande rij verandert. Een inschrijving op
-- /shift zonder rij in "PraesidiumShiftNecessity" telt als vrije wil, wat ook
-- is wat er tot nu toe gebeurde (niemand hield het bij).

-- CreateEnum
CREATE TYPE "PraesidiumShiftListKind" AS ENUM ('EVENT', 'WEEKLY');

-- CreateEnum
CREATE TYPE "PraesidiumShiftListStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- CreateEnum
CREATE TYPE "PraesidiumShiftCountMode" AS ENUM ('PER_NAME', 'BY_DURATION');

-- CreateEnum
CREATE TYPE "PraesidiumShiftNameStatus" AS ENUM ('MATCHED', 'IGNORED', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "PraesidiumShiftNameSource" AS ENUM ('ALIAS', 'FULL_NAME', 'FIRST_NAME', 'INITIAL', 'FUZZY', 'MANUAL', 'OTHER_KRING', 'NOT_PRAESIDIUM', 'NONE');

-- CreateTable
CREATE TABLE "PraesidiumShiftList" (
    "id" TEXT NOT NULL,
    "kind" "PraesidiumShiftListKind" NOT NULL DEFAULT 'EVENT',
    "status" "PraesidiumShiftListStatus" NOT NULL DEFAULT 'DRAFT',
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" DATE,
    "expectedPerMember" DOUBLE PRECISION,
    "countMode" "PraesidiumShiftCountMode" NOT NULL DEFAULT 'PER_NAME',
    "hoursPerShift" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "openSlots" INTEGER,
    "fileName" TEXT NOT NULL,
    "sheets" JSONB NOT NULL,
    "colors" JSONB NOT NULL,
    "slots" JSONB NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PraesidiumShiftList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PraesidiumShiftEntry" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "cell" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT,
    "role" TEXT,
    "slot" TEXT,
    "date" DATE,
    "hours" DOUBLE PRECISION,
    "note" TEXT,
    "done" BOOLEAN,
    "excluded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PraesidiumShiftEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PraesidiumShiftListName" (
    "listId" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "PraesidiumShiftNameStatus" NOT NULL,
    "source" "PraesidiumShiftNameSource" NOT NULL,
    "userId" TEXT,

    CONSTRAINT "PraesidiumShiftListName_pkey" PRIMARY KEY ("listId","nameKey")
);

-- CreateTable
CREATE TABLE "PraesidiumShiftAlias" (
    "nameKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "userId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PraesidiumShiftAlias_pkey" PRIMARY KEY ("nameKey")
);

-- CreateTable
CREATE TABLE "PraesidiumShiftContact" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "kring" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "userId" TEXT,

    CONSTRAINT "PraesidiumShiftContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PraesidiumShiftNecessity" (
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "markedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PraesidiumShiftNecessity_pkey" PRIMARY KEY ("shiftId","userId")
);

-- CreateIndex
CREATE INDEX "PraesidiumShiftList_year_kind_idx" ON "PraesidiumShiftList"("year", "kind");

-- CreateIndex
CREATE INDEX "PraesidiumShiftEntry_listId_nameKey_idx" ON "PraesidiumShiftEntry"("listId", "nameKey");

-- CreateIndex
CREATE INDEX "PraesidiumShiftListName_userId_idx" ON "PraesidiumShiftListName"("userId");

-- CreateIndex
CREATE INDEX "PraesidiumShiftAlias_userId_idx" ON "PraesidiumShiftAlias"("userId");

-- CreateIndex
CREATE INDEX "PraesidiumShiftContact_listId_idx" ON "PraesidiumShiftContact"("listId");

-- CreateIndex
CREATE INDEX "PraesidiumShiftContact_userId_idx" ON "PraesidiumShiftContact"("userId");

-- AddForeignKey
ALTER TABLE "PraesidiumShiftList" ADD CONSTRAINT "PraesidiumShiftList_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftEntry" ADD CONSTRAINT "PraesidiumShiftEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PraesidiumShiftList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftListName" ADD CONSTRAINT "PraesidiumShiftListName_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PraesidiumShiftList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftListName" ADD CONSTRAINT "PraesidiumShiftListName_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftAlias" ADD CONSTRAINT "PraesidiumShiftAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftAlias" ADD CONSTRAINT "PraesidiumShiftAlias_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftContact" ADD CONSTRAINT "PraesidiumShiftContact_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PraesidiumShiftList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftContact" ADD CONSTRAINT "PraesidiumShiftContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftNecessity" ADD CONSTRAINT "PraesidiumShiftNecessity_shiftId_userId_fkey" FOREIGN KEY ("shiftId", "userId") REFERENCES "ShiftParticipant"("shiftId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraesidiumShiftNecessity" ADD CONSTRAINT "PraesidiumShiftNecessity_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

