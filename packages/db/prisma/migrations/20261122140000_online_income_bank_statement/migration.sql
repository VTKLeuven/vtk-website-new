-- Bankafschriften (CSV van KBC): per afschrift de rekening en de dagen die het
-- dekt, en van zijn regels enkel die van SumUp, Payconiq, Mollie en
-- Europabank (dag, bedrag, referentie). Het bestand en de regels van leden
-- worden niet bewaard.
--
-- Bestaande rijen: niets verandert. Beide tabellen beginnen leeg; de site
-- koppelt een regel bij het lezen aan zijn uitbetaling, dus er is niets om in
-- te vullen. Europabank krijgt zijn uitbetaling (de OV-ref) pas wanneer een
-- export opnieuw opgeladen wordt; dat raakt geen code en geen maand.

-- CreateTable
CREATE TABLE "IncomeBankStatement" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "coveredFrom" DATE NOT NULL,
    "coveredTo" DATE NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "providerCount" INTEGER NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeBankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeBankLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "bookedOn" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "provider" "IncomeSource" NOT NULL,
    "reference" TEXT,
    "externalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeBankLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeBankStatement_account_coveredFrom_idx" ON "IncomeBankStatement"("account", "coveredFrom");

-- CreateIndex
CREATE INDEX "IncomeBankLine_account_bookedOn_idx" ON "IncomeBankLine"("account", "bookedOn");

-- CreateIndex
CREATE INDEX "IncomeBankLine_reference_idx" ON "IncomeBankLine"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeBankLine_statementId_externalKey_key" ON "IncomeBankLine"("statementId", "externalKey");

-- AddForeignKey
ALTER TABLE "IncomeBankStatement" ADD CONSTRAINT "IncomeBankStatement_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeBankLine" ADD CONSTRAINT "IncomeBankLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "IncomeBankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

