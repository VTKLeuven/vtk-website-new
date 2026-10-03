-- Een ticketsjabloon kan een boekhoudcode voorstellen; een event uit dat
-- sjabloon krijgt ze voorgevuld. Leeg = de maker kiest ze zelf.
ALTER TABLE "TicketEventTemplate" ADD COLUMN "accountingCodeId" TEXT;

-- CreateIndex
CREATE INDEX "TicketEventTemplate_accountingCodeId_idx" ON "TicketEventTemplate"("accountingCodeId");

-- AddForeignKey
ALTER TABLE "TicketEventTemplate" ADD CONSTRAINT "TicketEventTemplate_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Het meegeleverde cantussjabloon is dat van Activiteiten, dus 70010010001
-- Cantussen. Enkel zolang er nog niets gekozen is; de andere sjablonen blijven
-- leeg, want welke code daarbij hoort, weet enkel wie ze maakte.
UPDATE "TicketEventTemplate" t
SET "accountingCodeId" = c."id"
FROM "AccountingCode" c
WHERE t."slug" = 'cantus'
  AND t."builtIn" = true
  AND t."accountingCodeId" IS NULL
  AND c."code" = '70010010001';
