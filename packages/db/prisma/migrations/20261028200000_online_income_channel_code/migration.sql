-- Oriëntatie online inkomsten: alles telt mee, ook wat op de eigen rekening
-- van een post binnenkomt, zoals Beheer het in augustus en september 2026
-- deed. Een kanaal krijgt daarom geen eigenaar meer, maar een standaardcode
-- die Beheer kiest (de QR-code van Theokot onder de code van Theokot).
--
-- Bestaande kanalen krijgen geen standaardcode: een eigenaar zegt niet welke
-- code van die post het moet zijn, en die keuze is aan Beheer. Wat de regel
-- "eigen rekening" kreeg, staat daarom weer bij Na te kijken (rule NULL), tot
-- Beheer een standaardcode kiest en de koppelregels opnieuw lopen. In een
-- afgesloten periode telde het niet mee, en dat blijft zo: daar wordt het
-- "telt niet mee", zoals met de hand.

UPDATE "IncomeTransaction" AS t
SET "excluded" = true, "rule" = 'MANUAL'
WHERE t."rule" = 'OWN_ACCOUNT'
  AND EXISTS (
    SELECT 1 FROM "IncomePeriod" AS p
    WHERE t."periodMonth" BETWEEN p."fromMonth" AND p."toMonth"
  );

UPDATE "IncomeTransaction" SET "rule" = NULL WHERE "rule" = 'OWN_ACCOUNT';

-- AlterEnum: de waarde krijgt een nieuwe naam en houdt haar plaats.
ALTER TYPE "IncomeRule" RENAME VALUE 'OWN_ACCOUNT' TO 'CHANNEL_DEFAULT';

-- DropForeignKey
ALTER TABLE "IncomeChannel" DROP CONSTRAINT "IncomeChannel_ownerGroupId_fkey";

-- AlterTable
ALTER TABLE "IncomeChannel" DROP COLUMN "ownerGroupId",
ADD COLUMN     "defaultAccountingCodeId" TEXT;

-- AddForeignKey
ALTER TABLE "IncomeChannel" ADD CONSTRAINT "IncomeChannel_defaultAccountingCodeId_fkey" FOREIGN KEY ("defaultAccountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
