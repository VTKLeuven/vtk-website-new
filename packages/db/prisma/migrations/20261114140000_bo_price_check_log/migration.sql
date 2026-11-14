-- Een logboek van de prijscontroles bij de webshops (budgetten op de site).
-- Nieuwe tabel: nul rijen, er verandert niets aan bestaande budgetten.

-- CreateTable
CREATE TABLE "BoPriceCheckLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "budgetId" TEXT,
    "budgetName" TEXT,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "basis" TEXT,
    "product" TEXT,
    "reason" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "cached" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BoPriceCheckLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoPriceCheckLog_at_idx" ON "BoPriceCheckLog"("at");

-- CreateIndex
CREATE INDEX "BoPriceCheckLog_budgetId_at_idx" ON "BoPriceCheckLog"("budgetId", "at");

-- CreateIndex
CREATE INDEX "BoPriceCheckLog_shop_at_idx" ON "BoPriceCheckLog"("shop", "at");
