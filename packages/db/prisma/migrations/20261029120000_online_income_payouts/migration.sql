-- Oriëntatie online inkomsten, verfijningen: de uitbetalingen zoals de
-- provider ze noemt (de overschrijvingen uit het balansrapport van Mollie, de
-- uitbetalingsnummers van SumUp). Een nieuwe tabel, dus leeg voor wat al
-- opgeladen is. Dezelfde export opnieuw opladen vult ze aan: de transacties
-- tellen dan als al gekend, en een SumUp-verkoop zonder uitbetaling krijgt de
-- hare erbij, zoals een Mollie-betaling dat al deed. Hoe een transactie telt,
-- verandert niet.

-- CreateTable
CREATE TABLE "IncomePayout" (
    "source" "IncomeSource" NOT NULL,
    "reference" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "amountCents" INTEGER,
    "importId" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncomePayout_pkey" PRIMARY KEY ("source","reference")
);

-- CreateIndex
CREATE INDEX "IncomePayout_importId_idx" ON "IncomePayout"("importId");

-- AddForeignKey
ALTER TABLE "IncomePayout" ADD CONSTRAINT "IncomePayout_importId_fkey" FOREIGN KEY ("importId") REFERENCES "IncomeImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
