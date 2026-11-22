-- Wat het balansrapport van Mollie over elke betaling zegt (ID, maand,
-- bedrag), om na te kijken dat de betalingenexport volledig is: de berekende
-- wijziging van de dynamische reserve zou een ontbrekende betaling anders stil
-- opvangen. Geen naam of rekening van wie betaalde.
--
-- De tabel begint leeg: de site las de betalingen in het balansrapport tot nu
-- niet. Wie het balansrapport van een periode al uploadde, uploadt het één keer
-- opnieuw; tot dan zegt de controlelijst dat de reserve van die periode
-- onbekend is.

-- CreateTable
CREATE TABLE "IncomeMollieBalancePayment" (
    "paymentId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "importId" TEXT NOT NULL,

    CONSTRAINT "IncomeMollieBalancePayment_pkey" PRIMARY KEY ("paymentId")
);

-- CreateIndex
CREATE INDEX "IncomeMollieBalancePayment_month_idx" ON "IncomeMollieBalancePayment"("month");

-- CreateIndex
CREATE INDEX "IncomeMollieBalancePayment_importId_idx" ON "IncomeMollieBalancePayment"("importId");

-- AddForeignKey
ALTER TABLE "IncomeMollieBalancePayment" ADD CONSTRAINT "IncomeMollieBalancePayment_importId_fkey" FOREIGN KEY ("importId") REFERENCES "IncomeImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
