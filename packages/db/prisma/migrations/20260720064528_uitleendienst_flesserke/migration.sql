-- CreateTable
CREATE TABLE "UitleenFlesserkeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenFlesserkeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenFlesserkeItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "contentAmount" TEXT,
    "expiryDate" DATE,
    "colruytUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "locationShelf" TEXT,
    "locationRack" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenFlesserkeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenFlesserkeLine" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "flesserkeItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returnedQuantity" INTEGER,

    CONSTRAINT "UitleenFlesserkeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenFlesserkeItem_categoryId_active_idx" ON "UitleenFlesserkeItem"("categoryId", "active");

-- CreateIndex
CREATE INDEX "UitleenFlesserkeLine_reservationId_idx" ON "UitleenFlesserkeLine"("reservationId");

-- CreateIndex
CREATE INDEX "UitleenFlesserkeLine_flesserkeItemId_idx" ON "UitleenFlesserkeLine"("flesserkeItemId");

-- AddForeignKey
ALTER TABLE "UitleenFlesserkeItem" ADD CONSTRAINT "UitleenFlesserkeItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UitleenFlesserkeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenFlesserkeLine" ADD CONSTRAINT "UitleenFlesserkeLine_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "UitleenReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenFlesserkeLine" ADD CONSTRAINT "UitleenFlesserkeLine_flesserkeItemId_fkey" FOREIGN KEY ("flesserkeItemId") REFERENCES "UitleenFlesserkeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
