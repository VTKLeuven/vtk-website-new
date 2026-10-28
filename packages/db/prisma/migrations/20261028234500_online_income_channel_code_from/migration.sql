-- Oriëntatie online inkomsten: de standaardcode van een kanaal krijgt een
-- vanaf-datum, zoals de rekening. In september 2026 gebruikte de cursusdienst
-- de SumUp van Theokot; met één code zonder datum kwam dat bij Theokot.
--
-- Een bestaande standaardcode geldt vanaf de dag van de eerste transactie op
-- dat kanaal (op de Brusselse klok), zodat wat ze al koppelde, gekoppeld
-- blijft. Een kanaal zonder transacties krijgt ze vanaf vandaag.

-- CreateTable
CREATE TABLE "IncomeChannelCode" (
    "channelId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "accountingCodeId" TEXT,

    CONSTRAINT "IncomeChannelCode_pkey" PRIMARY KEY ("channelId","from")
);

-- CreateIndex
CREATE INDEX "IncomeChannelCode_accountingCodeId_idx" ON "IncomeChannelCode"("accountingCodeId");

-- De standaardcodes die er al zijn.
INSERT INTO "IncomeChannelCode" ("channelId", "from", "accountingCodeId")
SELECT c."id",
       COALESCE(
         (SELECT MIN((t."occurredAt" AT TIME ZONE 'Europe/Brussels')::date)
          FROM "IncomeTransaction" AS t
          WHERE t."channelId" = c."id"),
         CURRENT_DATE
       ),
       c."defaultAccountingCodeId"
FROM "IncomeChannel" AS c
WHERE c."defaultAccountingCodeId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "IncomeChannel" DROP CONSTRAINT "IncomeChannel_defaultAccountingCodeId_fkey";

-- AlterTable
ALTER TABLE "IncomeChannel" DROP COLUMN "defaultAccountingCodeId";

-- AddForeignKey
ALTER TABLE "IncomeChannelCode" ADD CONSTRAINT "IncomeChannelCode_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "IncomeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeChannelCode" ADD CONSTRAINT "IncomeChannelCode_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
