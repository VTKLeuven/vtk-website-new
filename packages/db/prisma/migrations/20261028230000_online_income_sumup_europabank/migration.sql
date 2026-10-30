-- Oriëntatie online inkomsten, fase 3: de exports van SumUp en Europabank.
-- Enkel twee nieuwe bronnen; bestaande transacties en kanalen veranderen niet.

-- AlterEnum
ALTER TYPE "IncomeSource" ADD VALUE 'SUMUP';
ALTER TYPE "IncomeSource" ADD VALUE 'EUROPABANK';
