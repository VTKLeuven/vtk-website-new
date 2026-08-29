-- CreateEnum
CREATE TYPE "FakbarItemCategory" AS ENUM ('VAT', 'BIER_WIJN', 'FRISDRANK', 'STERK');

-- CreateEnum
CREATE TYPE "FakbarWeekStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FakbarConsumptionCategory" AS ENUM ('TAPPERSDRANK', 'VERJAARDAGEN', 'ZAKPINTJES', 'MISLUKTE_PINTEN', 'KLANTENKAART', 'SUCCESPINTEN', 'VERKOOP');

-- CreateTable
CREATE TABLE "FakbarItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FakbarItemCategory" NOT NULL,
    "salesPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarWeek" (
    "id" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "FakbarWeekStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarEvening" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "hoofdtapperId" TEXT,
    "specialeActiviteit" TEXT,
    "bancontactRevenue" INTEGER NOT NULL DEFAULT 0,
    "cashToSafe" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarEvening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarCashRegisterCount" (
    "eveningId" TEXT NOT NULL,
    "cnt_0_05" INTEGER NOT NULL DEFAULT 0,
    "cnt_0_10" INTEGER NOT NULL DEFAULT 0,
    "cnt_0_20" INTEGER NOT NULL DEFAULT 0,
    "cnt_0_50" INTEGER NOT NULL DEFAULT 0,
    "cnt_1_00" INTEGER NOT NULL DEFAULT 0,
    "cnt_2_00" INTEGER NOT NULL DEFAULT 0,
    "cnt_5_00" INTEGER NOT NULL DEFAULT 0,
    "cnt_10_00" INTEGER NOT NULL DEFAULT 0,
    "cnt_20_00" INTEGER NOT NULL DEFAULT 0,
    "cnt_50_00" INTEGER NOT NULL DEFAULT 0,
    "cnt_100_00" INTEGER NOT NULL DEFAULT 0,
    "cnt_elixirbon" INTEGER NOT NULL DEFAULT 0,
    "cnt_guidogids" INTEGER NOT NULL DEFAULT 0,
    "cnt_medewerkersbon" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarCashRegisterCount_pkey" PRIMARY KEY ("eveningId")
);

-- CreateTable
CREATE TABLE "FakbarConsumption" (
    "id" TEXT NOT NULL,
    "eveningId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "category" "FakbarConsumptionCategory" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarStockCount" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "beginOpslag" INTEGER NOT NULL DEFAULT 0,
    "levering" INTEGER NOT NULL DEFAULT 0,
    "naarPost" INTEGER NOT NULL DEFAULT 0,
    "naarFrigo" INTEGER NOT NULL DEFAULT 0,
    "eindOpslag" INTEGER NOT NULL DEFAULT 0,
    "beginTelling" INTEGER NOT NULL DEFAULT 0,
    "eindTelling" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarStockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakbarRental" (
    "eveningId" TEXT NOT NULL,
    "rentalFee" INTEGER NOT NULL DEFAULT 25000,
    "expectedRevenue" INTEGER NOT NULL DEFAULT 0,
    "effectiveProfit" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FakbarRental_pkey" PRIMARY KEY ("eveningId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FakbarWeek_year_weekNumber_key" ON "FakbarWeek"("year", "weekNumber");

-- CreateIndex
CREATE INDEX "FakbarEvening_date_idx" ON "FakbarEvening"("date");

-- CreateIndex
CREATE INDEX "FakbarConsumption_eveningId_idx" ON "FakbarConsumption"("eveningId");

-- CreateIndex
CREATE UNIQUE INDEX "FakbarStockCount_weekId_itemId_key" ON "FakbarStockCount"("weekId", "itemId");

-- AddForeignKey
ALTER TABLE "FakbarEvening" ADD CONSTRAINT "FakbarEvening_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "FakbarWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarEvening" ADD CONSTRAINT "FakbarEvening_hoofdtapperId_fkey" FOREIGN KEY ("hoofdtapperId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarCashRegisterCount" ADD CONSTRAINT "FakbarCashRegisterCount_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "FakbarEvening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarConsumption" ADD CONSTRAINT "FakbarConsumption_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "FakbarEvening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarConsumption" ADD CONSTRAINT "FakbarConsumption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FakbarItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarStockCount" ADD CONSTRAINT "FakbarStockCount_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "FakbarWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarStockCount" ADD CONSTRAINT "FakbarStockCount_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FakbarItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FakbarRental" ADD CONSTRAINT "FakbarRental_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "FakbarEvening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

